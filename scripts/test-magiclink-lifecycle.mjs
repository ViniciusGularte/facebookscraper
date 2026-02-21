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
    // ignore
  }
}

function assertEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

function buildAliasedEmail(baseEmail) {
  const clean = String(baseEmail || "").trim().toLowerCase();
  const at = clean.indexOf("@");
  if (at <= 0 || at === clean.length - 1) {
    throw new Error(
      "Invalid base email for magiclink test. Set MAGICLINK_TEST_BASE_EMAIL.",
    );
  }
  const local = clean.slice(0, at);
  const domain = clean.slice(at + 1);
  const suffix = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  return `${local}+qa-magic-${suffix}@${domain}`;
}

function authHeadersAnon(anonKey) {
  return {
    apikey: anonKey,
    "Content-Type": "application/json",
  };
}

function authHeadersAdmin(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    "Content-Type": "application/json",
  };
}

function stripeSignature(rawBody, webhookSecret) {
  const ts = Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${rawBody}`;
  const v1 = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return `t=${ts},v1=${v1}`;
}

async function createTempAuthUser(projectUrl, serviceRoleKey, email) {
  const response = await fetch(`${projectUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: authHeadersAdmin(serviceRoleKey),
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { source: "magiclink-lifecycle-test" },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `create temp auth user failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload?.id ? String(payload.id) : String(payload?.user?.id || "");
}

async function fetchExistingAuthEmail(projectUrl, serviceRoleKey) {
  const response = await fetch(`${projectUrl}/auth/v1/admin/users?page=1&per_page=50`, {
    method: "GET",
    headers: authHeadersAdmin(serviceRoleKey),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return "";
  const users = Array.isArray(payload?.users) ? payload.users : [];
  const candidate = users.find((u) => typeof u?.email === "string" && u.email.includes("@"));
  return candidate?.email ? String(candidate.email).trim() : "";
}

async function deleteAuthUser(projectUrl, serviceRoleKey, userId) {
  if (!userId) return;
  await fetch(`${projectUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "DELETE",
    headers: authHeadersAdmin(serviceRoleKey),
  });
}

async function triggerOtpForExistingUser(projectUrl, anonKey, email) {
  const response = await fetch(`${projectUrl}/auth/v1/otp`, {
    method: "POST",
    headers: authHeadersAnon(anonKey),
    body: JSON.stringify({
      email,
      create_user: false,
      should_create_user: false,
      options: {},
    }),
  });
  const text = await response.text();
  return { status: response.status, ok: response.ok, body: text };
}

async function fetchAuthUserById(projectUrl, serviceRoleKey, userId) {
  const response = await fetch(
    `${projectUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "GET",
      headers: authHeadersAdmin(serviceRoleKey),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  return payload?.user || payload || null;
}

async function fetchPublicUser(projectUrl, serviceRoleKey, userId) {
  const url = new URL(`${projectUrl}/rest/v1/users`);
  url.searchParams.set("id", `eq.${userId}`);
  url.searchParams.set(
    "select",
    "id,email,plan,trial_start,trial_end,purchase_date,stripe_id,updated_at",
  );
  url.searchParams.set("limit", "1");
  const response = await fetch(url.toString(), {
    headers: authHeadersAdmin(serviceRoleKey),
  });
  const rows = await response.json().catch(() => []);
  if (!response.ok || !Array.isArray(rows)) return null;
  return rows[0] || null;
}

async function sendSignedWebhook(projectUrl, webhookSecret, userId, email) {
  const now = Date.now();
  const event = {
    id: `evt_magiclifecycle_${now}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    api_version: "2024-04-10",
    created: Math.floor(now / 1000),
    data: {
      object: {
        id: `cs_test_${now}`,
        object: "checkout.session",
        amount_total: 9700,
        payment_intent: `pi_test_${now}`,
        customer: null,
        metadata: { user_id: userId, email_hint: email },
        client_reference_id: userId,
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
  };
  const rawBody = JSON.stringify(event);
  const sig = stripeSignature(rawBody, webhookSecret);
  const response = await fetch(`${projectUrl}/functions/v1/stripe-webhook`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": sig,
    },
    body: rawBody,
  });
  const text = await response.text();
  return { status: response.status, ok: response.ok, body: text };
}

async function main() {
  await maybeLoadDotEnv();

  const projectUrl = String(process.env.SUPABASE_URL || DEFAULT_PROJECT_URL).trim();
  const anonKey = assertEnv("SUPABASE_ANON_KEY");
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const webhookSecret = assertEnv("STRIPE_WEBHOOK_SECRET");
  const strict = String(process.env.MAGICLINK_TEST_STRICT || "1").trim() === "1";
  let baseEmail = String(
    process.env.MAGICLINK_TEST_BASE_EMAIL ||
      process.env.TEST_USER_EMAIL ||
      "",
  ).trim();
  if (!baseEmail) {
    baseEmail = await fetchExistingAuthEmail(projectUrl, serviceRoleKey);
  }
  if (!baseEmail) {
    throw new Error("Set MAGICLINK_TEST_BASE_EMAIL to a valid address.");
  }
  const email = buildAliasedEmail(baseEmail);

  let userId = "";
  try {
    console.log("1) Creating temporary auth user...");
    userId = await createTempAuthUser(projectUrl, serviceRoleKey, email);
    if (!userId) throw new Error("Missing user id after temp user creation.");
    console.log(`   temp user id: ${userId}`);

    console.log("2) Triggering OTP for existing user (magic-link path)...");
    const otp = await triggerOtpForExistingUser(projectUrl, anonKey, email);
    console.log(`   otp response: ${otp.status} ${otp.body.slice(0, 220)}`);
    if (strict && !otp.ok) {
      throw new Error(`OTP request failed for existing user: ${otp.status}`);
    }

    console.log("3) Checking auth user exists...");
    const authUser = await fetchAuthUserById(projectUrl, serviceRoleKey, userId);
    if (strict && !authUser?.id) {
      throw new Error("auth user not found after creation.");
    }
    console.log(`   auth user email: ${String(authUser?.email || "")}`);

    console.log("4) Sending signed checkout.session.completed webhook...");
    const hook = await sendSignedWebhook(projectUrl, webhookSecret, userId, email);
    console.log(`   webhook response: ${hook.status} ${hook.body.slice(0, 260)}`);
    if (strict && !hook.ok) {
      throw new Error(`Webhook call failed (${hook.status}).`);
    }

    console.log("5) Checking public.users row for this user...");
    const publicUser = await fetchPublicUser(projectUrl, serviceRoleKey, userId);
    console.log(`   public.users row: ${JSON.stringify(publicUser || {}, null, 2)}`);
    if (strict && !publicUser?.id) {
      throw new Error("No public.users row found after webhook.");
    }
    if (strict && String(publicUser?.email || "").trim() === "") {
      throw new Error("public.users.email is empty after webhook.");
    }
    if (strict && String(publicUser?.plan || "").toLowerCase() !== "pro") {
      throw new Error(
        `Expected plan=pro after webhook, got "${String(publicUser?.plan || "")}"`,
      );
    }

    console.log("Magic-link lifecycle test finished successfully.");
  } finally {
    if (userId) {
      console.log("6) Cleaning up temporary auth user...");
      await deleteAuthUser(projectUrl, serviceRoleKey, userId);
    }
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
