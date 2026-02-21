#!/usr/bin/env node

import crypto from "node:crypto";

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
    const fs = await import("node:fs/promises");
    const content = await fs.readFile(".env", "utf8");
    const parsed = parseDotEnv(content);
    for (const [k, v] of Object.entries(parsed)) {
      if (!process.env[k]) process.env[k] = v;
    }
  } catch (_) {
    // Ignore missing .env.
  }
}

function assertEnv(key) {
  const value = String(process.env[key] || "").trim();
  if (!value) {
    throw new Error(`Missing env var: ${key}`);
  }
  return value;
}

function createStripeSignatureHeader(rawBody, webhookSecret) {
  const ts = Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${rawBody}`;
  const v1 = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return `t=${ts},v1=${v1}`;
}

async function supabasePasswordLogin({ projectUrl, anonKey, email, password }) {
  const url = `${projectUrl}/auth/v1/token?grant_type=password`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Supabase login failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function fetchUserPlan({ projectUrl, serviceRoleKey, userId }) {
  const url = new URL(`${projectUrl}/rest/v1/users`);
  url.searchParams.set("id", `eq.${userId}`);
  url.searchParams.set("select", "plan,trial_end,purchase_date,updated_at");
  url.searchParams.set("limit", "1");
  const response = await fetch(url.toString(), {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok) {
    throw new Error(`Failed reading users row (${response.status})`);
  }
  return Array.isArray(rows) ? rows[0] || null : null;
}

async function createCheckoutSession({
  projectUrl,
  anonKey,
  accessToken,
  endpointPath,
}) {
  const response = await fetch(`${projectUrl}${endpointPath}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `create-checkout-session failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function createCheckoutWithoutAuth({ projectUrl, anonKey, endpointPath }) {
  const response = await fetch(`${projectUrl}${endpointPath}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function fetchStripeCheckoutSession(stripeSecretKey, sessionId) {
  const response = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`,
    {
      headers: { Authorization: `Bearer ${stripeSecretKey}` },
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Stripe checkout retrieve failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

async function sendSignedStripeWebhook({
  projectUrl,
  webhookPath,
  webhookSecret,
  type,
  dataObject,
}) {
  const now = Date.now();
  const event = {
    id: `evt_test_${now}_${Math.random().toString(36).slice(2, 8)}`,
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
  const signature = createStripeSignatureHeader(rawBody, webhookSecret);
  const response = await fetch(`${projectUrl}${webhookPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": signature,
    },
    body: rawBody,
  });
  const payload = await response.text();
  return { ok: response.ok, status: response.status, body: payload, event };
}

async function waitForPlanChange({
  projectUrl,
  serviceRoleKey,
  userId,
  timeoutMs = 20000,
  intervalMs = 1500,
}) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    const row = await fetchUserPlan({ projectUrl, serviceRoleKey, userId });
    if (row?.updated_at) return row;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

async function main() {
  await maybeLoadDotEnv();

  const strict = String(process.env.BILLING_TEST_STRICT || "").trim() === "1";
  const projectUrl = String(process.env.SUPABASE_URL || DEFAULT_PROJECT_URL).trim();
  const anonKey = assertEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const stripeWebhookSecret = assertEnv("STRIPE_WEBHOOK_SECRET");
  const stripeSecretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const testEmail = String(process.env.TEST_USER_EMAIL || "").trim();
  const testPassword = String(process.env.TEST_USER_PASSWORD || "").trim();
  const fallbackUserId = String(
    process.env.WEBHOOK_TEST_USER_ID || "00000000-0000-0000-0000-000000000000",
  ).trim();
  const checkoutPath =
    String(process.env.CREATE_CHECKOUT_PATH || "/functions/v1/create-checkout-session").trim();
  const webhookPath =
    String(process.env.WEBHOOK_PATH || "/functions/v1/stripe-webhook").trim();
  const canRunPasswordFlow = !!testEmail && !!testPassword && !!stripeSecretKey;

  console.log("1) Checking create-checkout-session auth guard...");
  const unauthCheckout = await createCheckoutWithoutAuth({
    projectUrl,
    anonKey,
    endpointPath: checkoutPath,
  });
  console.log(
    `   unauth create-checkout response: ${unauthCheckout.status} ${JSON.stringify(unauthCheckout.payload)}`,
  );
  if (strict && unauthCheckout.status !== 401) {
    throw new Error(
      `Expected create-checkout-session to require auth (401), got ${unauthCheckout.status}`,
    );
  }

  if (!canRunPasswordFlow) {
    console.log(
      "2) Password flow skipped (magic-link mode). Using signed webhook validation only.",
    );
    const webhookResult = await sendSignedStripeWebhook({
      projectUrl,
      webhookPath,
      webhookSecret: stripeWebhookSecret,
      type: "checkout.session.completed",
      dataObject: {
        id: `cs_test_${Date.now()}`,
        object: "checkout.session",
        amount_total: 9700,
        payment_intent: `pi_test_${Date.now()}`,
        metadata: { user_id: fallbackUserId },
        client_reference_id: fallbackUserId,
      },
    });
    console.log(
      `   webhook response: ${webhookResult.status} ${webhookResult.body.slice(0, 260)}`,
    );
    if (strict && !webhookResult.ok) {
      throw new Error("Webhook processing failed in strict mode.");
    }
    if (strict) {
      const parsed = JSON.parse(webhookResult.body || "{}");
      if (parsed?.ignored) {
        throw new Error(
          "Webhook returned ignored=true. Set WEBHOOK_TEST_USER_ID to a valid users.id.",
        );
      }
    }
    console.log("Billing flow validation finished (magic-link mode).");
    return;
  }

  console.log("2) Logging in test user via Supabase Auth...");
  const auth = await supabasePasswordLogin({
    projectUrl,
    anonKey,
    email: testEmail,
    password: testPassword,
  });
  const accessToken = String(auth?.access_token || "").trim();
  const userId = String(auth?.user?.id || "").trim();
  if (!accessToken || !userId) {
    throw new Error("Login succeeded but missing access_token or user.id.");
  }
  console.log(`   user_id: ${userId}`);

  const before = await fetchUserPlan({ projectUrl, serviceRoleKey, userId });
  console.log(`3) Current plan row: ${JSON.stringify(before || {}, null, 2)}`);

  console.log("4) Creating checkout session through Edge Function...");
  const checkoutPayload = await createCheckoutSession({
    projectUrl,
    anonKey,
    accessToken,
    endpointPath: checkoutPath,
  });
  const checkoutUrl = String(checkoutPayload?.checkout_url || "").trim();
  const sessionId = String(checkoutPayload?.session_id || "").trim();
  if (!/^https:\/\/checkout\.stripe\.com\//.test(checkoutUrl) || !sessionId) {
    throw new Error(
      `Invalid checkout payload: ${JSON.stringify(checkoutPayload)}`,
    );
  }
  console.log(`   checkout session: ${sessionId}`);

  console.log("5) Validating session metadata directly in Stripe...");
  const stripeSession = await fetchStripeCheckoutSession(stripeSecretKey, sessionId);
  const stripeRef = String(stripeSession?.client_reference_id || "").trim();
  const stripeMetaUser = String(stripeSession?.metadata?.user_id || "").trim();
  const stripePrice = String(
    stripeSession?.line_items?.data?.[0]?.price?.id || process.env.STRIPE_PRICE_ID || "",
  ).trim();
  console.log(
    `   stripe session fields: client_reference_id=${stripeRef}, metadata.user_id=${stripeMetaUser}, price=${stripePrice || "(n/a)"}`,
  );
  if (strict && stripeRef !== userId && stripeMetaUser !== userId) {
    throw new Error(
      "Stripe session missing expected user identifier in client_reference_id/metadata.user_id",
    );
  }

  console.log("6) Sending signed checkout.session.completed webhook...");
  const paymentIntentId = `pi_test_${Date.now()}`;
  const webhookResult = await sendSignedStripeWebhook({
    projectUrl,
    webhookPath,
    webhookSecret: stripeWebhookSecret,
    type: "checkout.session.completed",
    dataObject: {
      id: sessionId,
      object: "checkout.session",
      amount_total: 9700,
      payment_intent: paymentIntentId,
      metadata: { user_id: userId },
      client_reference_id: userId,
    },
  });
  console.log(
    `   webhook response: ${webhookResult.status} ${webhookResult.body.slice(0, 260)}`,
  );
  if (strict && !webhookResult.ok) {
    throw new Error("Webhook processing failed in strict mode.");
  }

  console.log("7) Reading users row after webhook...");
  const after = await waitForPlanChange({
    projectUrl,
    serviceRoleKey,
    userId,
  });
  console.log(`   updated plan row: ${JSON.stringify(after || {}, null, 2)}`);

  if (strict) {
    if (!after) {
      throw new Error("users row not found/updated after webhook.");
    }
    const plan = String(after.plan || "").toLowerCase();
    if (plan !== "pro") {
      throw new Error(`Expected plan=pro after webhook, got "${plan || "empty"}".`);
    }
  }

  console.log("Billing flow validation finished.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
