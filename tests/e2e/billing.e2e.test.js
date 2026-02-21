import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const DEFAULT_SUPABASE_URL = "https://hfnwpzglvbzkvhrcwmet.supabase.co";
const CREATE_CHECKOUT_PATH = "/functions/v1/create-checkout-session";
const WEBHOOK_PATH = "/functions/v1/stripe-webhook";

function loadDotEnv() {
  if (!fs.existsSync(".env")) return;
  const raw = fs.readFileSync(".env", "utf8");
  for (const rawLine of raw.split(/\r?\n/)) {
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
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

const projectUrl = String(process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
const anonKey = String(process.env.SUPABASE_ANON_KEY || "");
const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || "");
const testEmail = String(process.env.TEST_USER_EMAIL || "");
const testPassword = String(process.env.TEST_USER_PASSWORD || "");
const testUserId = String(
  process.env.WEBHOOK_TEST_USER_ID || "00000000-0000-0000-0000-000000000000",
);

const hasAnon = !!anonKey;
const hasWebhookSecret = !!webhookSecret;
const hasCredentials = !!testEmail && !!testPassword && !!anonKey;

function signStripePayload(rawBody, secret) {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${ts}.${rawBody}`;
  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload, "utf8")
    .digest("hex");
  return `t=${ts},v1=${sig}`;
}

async function loginWithPassword() {
  const response = await fetch(`${projectUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: testEmail, password: testPassword }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Login failed (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  return payload;
}

test(
  "create-checkout-session rejects missing Authorization",
  { skip: !hasAnon },
  async () => {
    const response = await fetch(`${projectUrl}${CREATE_CHECKOUT_PATH}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    assert.equal(response.status, 401);
  },
);

test(
  "create-checkout-session returns checkout_url and session_id for authenticated user",
  { skip: !hasCredentials },
  async () => {
    const auth = await loginWithPassword();
    const accessToken = String(auth?.access_token || "");
    assert.notEqual(accessToken, "");

    const response = await fetch(`${projectUrl}${CREATE_CHECKOUT_PATH}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const payload = await response.json().catch(() => ({}));
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.match(String(payload?.checkout_url || ""), /^https:\/\/checkout\.stripe\.com\//);
    assert.match(String(payload?.session_id || ""), /^cs_/);
  },
);

test(
  "stripe-webhook rejects request without signature",
  { skip: !hasWebhookSecret },
  async () => {
    const response = await fetch(`${projectUrl}${WEBHOOK_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ping: true }),
    });
    assert.ok(
      response.status === 400 || response.status === 401,
      `unexpected status: ${response.status}`,
    );
    const body = await response.text();
    assert.match(body, /stripe-signature|authorization/i);
  },
);

test(
  "stripe-webhook rejects request with invalid signature",
  { skip: !hasWebhookSecret },
  async () => {
    const rawBody = JSON.stringify({
      id: "evt_invalid_sig",
      object: "event",
      type: "checkout.session.completed",
      data: { object: { id: "cs_test_invalid" } },
    });
    const response = await fetch(`${projectUrl}${WEBHOOK_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": "t=123,v1=notvalid",
      },
      body: rawBody,
    });
    assert.ok(
      response.status === 400 || response.status === 401,
      `unexpected status: ${response.status}`,
    );
    const body = await response.text();
    assert.match(body, /invalid signature|authorization/i);
  },
);

test(
  "stripe-webhook accepts signed checkout.session.completed event shape",
  { skip: !hasWebhookSecret },
  async () => {
    const event = {
      id: `evt_checkout_${Date.now()}`,
      object: "event",
      api_version: "2024-04-10",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "checkout.session.completed",
      data: {
        object: {
          id: `cs_test_${Date.now()}`,
          object: "checkout.session",
          amount_total: 9700,
          payment_intent: `pi_test_${Date.now()}`,
          metadata: { user_id: testUserId },
          client_reference_id: testUserId,
        },
      },
    };
    const rawBody = JSON.stringify(event);
    const signature = signStripePayload(rawBody, webhookSecret);
    const response = await fetch(`${projectUrl}${WEBHOOK_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body: rawBody,
    });

    // Accept 2xx or known logical 4xx from downstream validation; reject infra 5xx.
    assert.ok(response.status < 500, `unexpected status: ${response.status}`);
  },
);

test(
  "stripe-webhook accepts signed payment_intent.payment_failed event shape",
  { skip: !hasWebhookSecret },
  async () => {
    const event = {
      id: `evt_pi_fail_${Date.now()}`,
      object: "event",
      api_version: "2024-04-10",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      type: "payment_intent.payment_failed",
      data: {
        object: {
          id: `pi_test_${Date.now()}`,
          object: "payment_intent",
          amount: 9700,
          latest_charge: `ch_test_${Date.now()}`,
          metadata: { user_id: testUserId },
        },
      },
    };
    const rawBody = JSON.stringify(event);
    const signature = signStripePayload(rawBody, webhookSecret);
    const response = await fetch(`${projectUrl}${WEBHOOK_PATH}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "stripe-signature": signature,
      },
      body: rawBody,
    });
    assert.ok(response.status < 500, `unexpected status: ${response.status}`);
  },
);
