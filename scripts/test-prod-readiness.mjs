#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";

const DEFAULT_PROJECT_URL = "https://hfnwpzglvbzkvhrcwmet.supabase.co";

function parseDotEnv(text) {
  const out = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

async function maybeLoadDotEnv() {
  try {
    const content = await fs.readFile(".env", "utf8");
    const parsed = parseDotEnv(content);
    for (const [k, v] of Object.entries(parsed)) {
      if (!process.env[k]) process.env[k] = v;
    }
  } catch (_) {
    // Ignore missing .env.
  }
}

function assertEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function adminHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function anonHeaders(anonKey) {
  return {
    apikey: anonKey,
    "Content-Type": "application/json",
  };
}

function signStripePayload(rawBody, webhookSecret) {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${ts}.${rawBody}`;
  const sig = crypto
    .createHmac("sha256", webhookSecret)
    .update(payload, "utf8")
    .digest("hex");
  return `t=${ts},v1=${sig}`;
}

function buildAliasedEmail(baseEmail) {
  const clean = String(baseEmail || "").trim().toLowerCase();
  const at = clean.indexOf("@");
  if (at <= 0 || at === clean.length - 1) {
    throw new Error("Invalid PROD_TEST_BASE_EMAIL.");
  }
  const local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  return `${local}+prodtest-${suffix}@${domain}`;
}

async function fetchExistingAuthEmail(projectUrl, serviceRoleKey) {
  const response = await fetch(`${projectUrl}/auth/v1/admin/users?page=1&per_page=50`, {
    method: "GET",
    headers: adminHeaders(serviceRoleKey),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return "";
  const users = Array.isArray(payload?.users) ? payload.users : [];
  const found = users.find((u) => typeof u?.email === "string" && u.email.includes("@"));
  return found?.email ? String(found.email).trim() : "";
}

async function createTempUser(projectUrl, serviceRoleKey, email) {
  const response = await fetch(`${projectUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders(serviceRoleKey),
    body: JSON.stringify({ email, email_confirm: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `create temp user failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return String(payload?.id || payload?.user?.id || "");
}

async function deleteTempUser(projectUrl, serviceRoleKey, userId) {
  if (!userId) return;
  await fetch(`${projectUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: adminHeaders(serviceRoleKey),
  });
}

async function fetchPublicUser(projectUrl, serviceRoleKey, userId) {
  const url = new URL(`${projectUrl}/rest/v1/users`);
  url.searchParams.set("id", `eq.${userId}`);
  url.searchParams.set("select", "id,email,plan,trial_end,purchase_date,stripe_id,updated_at");
  url.searchParams.set("limit", "1");
  const response = await fetch(url.toString(), {
    headers: adminHeaders(serviceRoleKey),
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows)) return null;
  return rows[0] || null;
}

async function createCheckoutUnauthorized(projectUrl, anonKey, checkoutPath) {
  const response = await fetch(`${projectUrl}${checkoutPath}`, {
    method: "POST",
    headers: anonHeaders(anonKey),
    body: "{}",
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function supabasePasswordLogin(projectUrl, anonKey, email, password) {
  const response = await fetch(`${projectUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: anonHeaders(anonKey),
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `password login failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function createCheckoutAuthorized(projectUrl, anonKey, accessToken, checkoutPath) {
  const response = await fetch(`${projectUrl}${checkoutPath}`, {
    method: "POST",
    headers: {
      ...anonHeaders(anonKey),
      Authorization: `Bearer ${accessToken}`,
    },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `authorized checkout failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function fetchStripeCheckoutSession(stripeSecretKey, sessionId) {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `stripe checkout retrieve failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function sendStripeEvent({
  projectUrl,
  webhookPath,
  webhookSecret,
  eventId,
  type,
  dataObject,
}) {
  const now = Date.now();
  const event = {
    id: eventId || `evt_prod_${now}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    api_version: "2024-04-10",
    created: Math.floor(now / 1000),
    data: { object: dataObject },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  };
  const rawBody = JSON.stringify(event);
  const signature = signStripePayload(rawBody, webhookSecret);
  const startedAt = Date.now();
  const response = await fetch(`${projectUrl}${webhookPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: rawBody,
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch (_) {
    payload = { raw: text };
  }
  return {
    status: response.status,
    ok: response.ok,
    payload,
    durationMs: Date.now() - startedAt,
  };
}

function report(results) {
  console.log("\n=== Prod Readiness Report ===");
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`${status} - ${r.name}${r.detail ? ` :: ${r.detail}` : ""}`);
  }
  const failed = results.filter((r) => !r.pass).length;
  console.log(`Summary: ${results.length - failed} passed / ${failed} failed`);
  return failed;
}

async function main() {
  await maybeLoadDotEnv();

  const strict = String(process.env.PROD_READINESS_STRICT || "1").trim() === "1";
  const maxWebhookMs = Number(process.env.PROD_WEBHOOK_MAX_MS || 5000);
  const expectedFinalPlan = String(
    process.env.PROD_EXPECTED_FINAL_PLAN || "free",
  ).trim().toLowerCase();
  const projectUrl = String(process.env.SUPABASE_URL || DEFAULT_PROJECT_URL).trim();
  const anonKey = assertEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = assertEnv("STRIPE_WEBHOOK_SECRET");
  const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const testUserEmail = String(process.env.TEST_USER_EMAIL || "").trim();
  const testUserPassword = String(process.env.TEST_USER_PASSWORD || "").trim();
  const expectSuccessUrl = String(process.env.PROD_EXPECT_SUCCESS_URL || "").trim();
  const expectCancelUrl = String(process.env.PROD_EXPECT_CANCEL_URL || "").trim();
  const enforceCheckoutUrls =
    String(process.env.PROD_ENFORCE_CHECKOUT_URLS || "0").trim() === "1";
  const checkoutPath = String(
    process.env.CREATE_CHECKOUT_PATH || "/functions/v1/create-checkout-session",
  ).trim();
  const webhookPath = String(
    process.env.WEBHOOK_PATH || "/functions/v1/stripe-webhook",
  ).trim();

  let baseEmail = String(
    process.env.PROD_TEST_BASE_EMAIL ||
      process.env.MAGICLINK_TEST_BASE_EMAIL ||
      process.env.TEST_USER_EMAIL ||
      "",
  ).trim();
  if (!baseEmail) baseEmail = await fetchExistingAuthEmail(projectUrl, serviceRoleKey);
  if (!baseEmail) {
    throw new Error("Set PROD_TEST_BASE_EMAIL to a valid email.");
  }

  const results = [];
  let userId = "";
  try {
    const email = buildAliasedEmail(baseEmail);
    userId = await createTempUser(projectUrl, serviceRoleKey, email);
    results.push({
      name: "Create temp auth user",
      pass: !!userId,
      detail: userId || "no user id",
    });

    const unauth = await createCheckoutUnauthorized(projectUrl, anonKey, checkoutPath);
    results.push({
      name: "Checkout unauthorized guard",
      pass: unauth.status === 401 || (!strict && unauth.status < 500),
      detail: `status=${unauth.status}`,
    });

    const canCheckUrls = !!stripeSecretKey && !!testUserEmail && !!testUserPassword;
    if (canCheckUrls) {
      try {
        const login = await supabasePasswordLogin(
          projectUrl,
          anonKey,
          testUserEmail,
          testUserPassword,
        );
        const accessToken = String(login?.access_token || "").trim();
        const checkout = await createCheckoutAuthorized(
          projectUrl,
          anonKey,
          accessToken,
          checkoutPath,
        );
        const checkoutSessionId = String(checkout?.session_id || "").trim();
        const stripeSession = await fetchStripeCheckoutSession(
          stripeSecretKey,
          checkoutSessionId,
        );
        const successUrl = String(stripeSession?.success_url || "").trim();
        const cancelUrl = String(stripeSession?.cancel_url || "").trim();

        const successOk = expectSuccessUrl
          ? successUrl === expectSuccessUrl
          : /^https?:\/\//i.test(successUrl);
        const cancelOk = expectCancelUrl
          ? cancelUrl === expectCancelUrl
          : /^https?:\/\//i.test(cancelUrl);

        results.push({
          name: "Checkout success_url",
          pass: successOk,
          detail: successUrl || "(empty)",
        });
        results.push({
          name: "Checkout cancel_url",
          pass: cancelOk,
          detail: cancelUrl || "(empty)",
        });
      } catch (err) {
        results.push({
          name: "Checkout success/cancel URL validation",
          pass: false,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      results.push({
        name: "Checkout success/cancel URL validation",
        pass: !enforceCheckoutUrls,
        detail: "skipped (need STRIPE_SECRET_KEY + TEST_USER_EMAIL + TEST_USER_PASSWORD)",
      });
    }

    const sessionId = `cs_test_${Date.now()}`;
    const paymentIntent = `pi_test_${Date.now()}`;
    const chargeId = `ch_test_${Date.now()}`;
    const firstEventId = `evt_prod_first_${Date.now()}`;

    const first = await sendStripeEvent({
      projectUrl,
      webhookPath,
      webhookSecret,
      eventId: firstEventId,
      type: "checkout.session.completed",
      dataObject: {
        id: sessionId,
        object: "checkout.session",
        amount_total: 9700,
        payment_intent: paymentIntent,
        metadata: { user_id: userId },
        client_reference_id: userId,
      },
    });
    results.push({
      name: "Webhook checkout.session.completed",
      pass:
        (strict ? first.ok : first.status < 500) &&
        (Number.isFinite(maxWebhookMs) ? first.durationMs <= maxWebhookMs : true),
      detail: `status=${first.status} ${first.durationMs}ms idempotent=${first.payload?.rpc?.idempotent}`,
    });

    const duplicate = await sendStripeEvent({
      projectUrl,
      webhookPath,
      webhookSecret,
      eventId: firstEventId,
      type: "checkout.session.completed",
      dataObject: {
        id: sessionId,
        object: "checkout.session",
        amount_total: 9700,
        payment_intent: paymentIntent,
        metadata: { user_id: userId },
        client_reference_id: userId,
      },
    });
    const dupIdempotent = duplicate?.payload?.rpc?.idempotent === true;
    results.push({
      name: "Webhook idempotency (duplicate event_id)",
      pass:
        (strict ? duplicate.ok && dupIdempotent : duplicate.status < 500) &&
        (Number.isFinite(maxWebhookMs) ? duplicate.durationMs <= maxWebhookMs : true),
      detail: `status=${duplicate.status} ${duplicate.durationMs}ms idempotent=${duplicate.payload?.rpc?.idempotent}`,
    });

    const refund = await sendStripeEvent({
      projectUrl,
      webhookPath,
      webhookSecret,
      type: "charge.refunded",
      dataObject: {
        id: chargeId,
        object: "charge",
        amount: 9700,
        customer: null,
        metadata: { user_id: userId },
      },
    });
    results.push({
      name: "Webhook charge.refunded",
      pass:
        (strict ? refund.ok : refund.status < 500) &&
        (Number.isFinite(maxWebhookMs) ? refund.durationMs <= maxWebhookMs : true),
      detail: `status=${refund.status} ${refund.durationMs}ms`,
    });

    const dispute = await sendStripeEvent({
      projectUrl,
      webhookPath,
      webhookSecret,
      type: "charge.dispute.created",
      dataObject: {
        id: `dp_test_${Date.now()}`,
        object: "dispute",
        amount: 9700,
        charge: {
          id: chargeId,
          amount: 9700,
          customer: null,
          metadata: { user_id: userId },
        },
      },
    });
    results.push({
      name: "Webhook charge.dispute.created",
      pass:
        (strict ? dispute.ok : dispute.status < 500) &&
        (Number.isFinite(maxWebhookMs) ? dispute.durationMs <= maxWebhookMs : true),
      detail: `status=${dispute.status} ${dispute.durationMs}ms`,
    });

    const publicUser = await fetchPublicUser(projectUrl, serviceRoleKey, userId);
    results.push({
      name: "public.users row exists",
      pass: !!publicUser?.id,
      detail: publicUser?.id || "missing",
    });
    results.push({
      name: "public.users email populated",
      pass: String(publicUser?.email || "").trim().length > 0,
      detail: String(publicUser?.email || "(empty)"),
    });
    results.push({
      name: "public.users final plan policy",
      pass:
        String(publicUser?.plan || "").trim().toLowerCase() === expectedFinalPlan,
      detail: `expected=${expectedFinalPlan} actual=${String(publicUser?.plan || "(empty)")}`,
    });

    const failed = report(results);
    if (failed > 0) process.exit(1);
  } finally {
    if (userId) {
      await deleteTempUser(projectUrl, serviceRoleKey, userId);
      console.log(`Cleanup done for temp user: ${userId}`);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
