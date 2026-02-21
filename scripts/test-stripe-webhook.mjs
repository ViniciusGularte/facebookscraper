#!/usr/bin/env node

import crypto from "node:crypto";

const DEFAULT_WEBHOOK_URL =
  "https://hfnwpzglvbzkvhrcwmet.supabase.co/functions/v1/stripe-webhook";

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

function createStripeSignatureHeader(rawBody, webhookSecret) {
  const ts = Math.floor(Date.now() / 1000);
  const signedPayload = `${ts}.${rawBody}`;
  const v1 = crypto
    .createHmac("sha256", webhookSecret)
    .update(signedPayload, "utf8")
    .digest("hex");
  return `t=${ts},v1=${v1}`;
}

function buildEvent(type, dataObject) {
  const now = Date.now();
  return {
    id: `evt_codex_${now}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    api_version: "2024-04-10",
    created: Math.floor(now / 1000),
    data: {
      object: dataObject,
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type,
  };
}

async function sendSignedEvent(url, webhookSecret, type, dataObject) {
  const event = buildEvent(type, dataObject);
  const rawBody = JSON.stringify(event);
  const signature = createStripeSignatureHeader(rawBody, webhookSecret);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: rawBody,
  });
  const text = await response.text();
  return {
    status: response.status,
    ok: response.ok,
    body: text,
    type,
  };
}

async function main() {
  await maybeLoadDotEnv();

  const webhookUrl = process.env.WEBHOOK_URL || DEFAULT_WEBHOOK_URL;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  const strict = String(process.env.WEBHOOK_TEST_STRICT || "").trim() === "1";

  if (!webhookSecret) {
    console.error("Missing STRIPE_WEBHOOK_SECRET.");
    console.error(
      "Set it in env or .env. Example: STRIPE_WEBHOOK_SECRET=whsec_...",
    );
    process.exit(1);
  }

  const smokeResponse = await fetch(webhookUrl, { method: "OPTIONS" });
  if (!smokeResponse.ok) {
    console.error(
      `Webhook OPTIONS failed: ${smokeResponse.status} for ${webhookUrl}`,
    );
    process.exit(1);
  }
  console.log(`Webhook reachable: ${webhookUrl}`);

  const testUserId =
    process.env.WEBHOOK_TEST_USER_ID ||
    "00000000-0000-0000-0000-000000000000";

  const scenarios = [
    {
      type: "checkout.session.completed",
      data: {
        id: `cs_test_${Date.now()}`,
        object: "checkout.session",
        amount_total: 9700,
        payment_intent: `pi_test_${Date.now()}`,
        metadata: { user_id: testUserId },
        client_reference_id: testUserId,
      },
    },
    {
      type: "payment_intent.payment_failed",
      data: {
        id: `pi_test_${Date.now()}`,
        object: "payment_intent",
        amount: 9700,
        latest_charge: `ch_test_${Date.now()}`,
        metadata: { user_id: testUserId },
      },
    },
    {
      type: "charge.dispute.created",
      data: {
        id: `dp_test_${Date.now()}`,
        object: "dispute",
        amount: 9700,
        charge: {
          id: `ch_test_${Date.now()}`,
          amount: 9700,
          metadata: { user_id: testUserId },
        },
      },
    },
  ];

  let failures = 0;
  for (const scenario of scenarios) {
    try {
      const result = await sendSignedEvent(
        webhookUrl,
        webhookSecret,
        scenario.type,
        scenario.data,
      );
      const pass = strict ? result.ok : result.status < 500;
      if (pass) {
        console.log(`PASS ${scenario.type} -> ${result.status}`);
      } else {
        failures += 1;
        console.error(`FAIL ${scenario.type} -> ${result.status}`);
      }
      if (result.body) {
        console.log(`  body: ${result.body.slice(0, 220)}`);
      }
    } catch (err) {
      failures += 1;
      console.error(
        `FAIL ${scenario.type} -> ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  if (failures > 0) {
    console.error(`Webhook validation finished with ${failures} failure(s).`);
    process.exit(1);
  }
  console.log("Webhook validation finished successfully.");
}

await main();
