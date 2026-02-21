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

function signStripePayload(rawBody, webhookSecret) {
  const ts = Math.floor(Date.now() / 1000);
  const payload = `${ts}.${rawBody}`;
  const sig = crypto
    .createHmac("sha256", webhookSecret)
    .update(payload, "utf8")
    .digest("hex");
  return `t=${ts},v1=${sig}`;
}

async function sendAlert(alertWebhookUrl, body) {
  if (!alertWebhookUrl) return;
  try {
    await fetch(alertWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // ignore alert errors
  }
}

async function main() {
  await maybeLoadDotEnv();

  const projectUrl = String(process.env.SUPABASE_URL || DEFAULT_PROJECT_URL).trim();
  const webhookPath = String(
    process.env.WEBHOOK_PATH || "/functions/v1/stripe-webhook",
  ).trim();
  const webhookSecret = assertEnv("STRIPE_WEBHOOK_SECRET");
  const testUserId = String(
    process.env.WEBHOOK_TEST_USER_ID || "00000000-0000-0000-0000-000000000000",
  ).trim();
  const maxLatencyMs = Number(process.env.WEBHOOK_HEALTH_MAX_MS || 5000);
  const alertWebhookUrl = String(process.env.ALERT_WEBHOOK_URL || "").trim();

  const event = {
    id: `evt_health_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    object: "event",
    api_version: "2024-04-10",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: `cs_health_${Date.now()}`,
        object: "checkout.session",
        amount_total: 9700,
        payment_intent: `pi_health_${Date.now()}`,
        metadata: { user_id: testUserId },
        client_reference_id: testUserId,
      },
    },
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    type: "checkout.session.completed",
  };

  const rawBody = JSON.stringify(event);
  const sig = signStripePayload(rawBody, webhookSecret);
  const startedAt = Date.now();
  const response = await fetch(`${projectUrl}${webhookPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "stripe-signature": sig,
    },
    body: rawBody,
  });
  const latencyMs = Date.now() - startedAt;
  const text = await response.text();

  const ok = response.ok && response.status < 500 && latencyMs <= maxLatencyMs;
  const report = {
    ok,
    status: response.status,
    latency_ms: latencyMs,
    max_latency_ms: maxLatencyMs,
    webhook: `${projectUrl}${webhookPath}`,
    body_preview: text.slice(0, 220),
    ts: new Date().toISOString(),
  };

  if (!ok) {
    console.error("WEBHOOK_HEALTH_FAIL", JSON.stringify(report));
    await sendAlert(alertWebhookUrl, {
      type: "webhook_health_fail",
      ...report,
    });
    process.exit(1);
  }

  console.log("WEBHOOK_HEALTH_OK", JSON.stringify(report));
}

main().catch(async (err) => {
  const alertWebhookUrl = String(process.env.ALERT_WEBHOOK_URL || "").trim();
  const msg = err instanceof Error ? err.message : String(err);
  console.error(msg);
  await sendAlert(alertWebhookUrl, {
    type: "webhook_health_exception",
    error: msg,
    ts: new Date().toISOString(),
  });
  process.exit(1);
});
