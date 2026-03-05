import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const DEFAULT_SUPABASE_URL = "https://hfnwpzglvbzkvhrcwmet.supabase.co";
const LICENSE_PATH = "/functions/v1/validate-license";

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
const paidKey = String(process.env.TEST_LICENSE_KEY || "").trim();
const runRemote = String(process.env.RUN_REMOTE_LICENSE_E2E || "").trim() === "1";

async function callLicense(body) {
  const response = await fetch(`${projectUrl}${LICENSE_PATH}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

test(
  "validate-license rejects invalid action",
  { skip: !runRemote || !anonKey },
  async () => {
    const { response } = await callLicense({
      action: "nope",
      email: "user@example.com",
      deviceId: "device-invalid-action",
    });
    assert.equal(response.status, 400);
  },
);

test(
  "validate-license starts a trial and returns normalized fields",
  { skip: !runRemote || !anonKey },
  async () => {
    const email = `trial-${Date.now()}@example.com`;
    const deviceId = `device-${Date.now()}-trial`;
    const { response, payload } = await callLicense({
      action: "start_trial",
      email,
      deviceId,
      deviceName: "Trial Test Device",
      trialDays: 1,
    });
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(String(payload?.email || ""), email);
    assert.match(String(payload?.plan || ""), /^(trial|pro)$/);
    assert.ok("trial_end" in payload);
    assert.ok("purchase_date" in payload);
    assert.equal(String(payload?.device_id || ""), deviceId);
  },
);

test(
  "validate-license activates a paid license when env is provided",
  { skip: !runRemote || !anonKey || !paidKey },
  async () => {
    const deviceId = `device-${Date.now()}-paid`;
    const { response, payload } = await callLicense({
      action: "activate",
      licenseKey: paidKey,
      deviceId,
      deviceName: "Paid Test Device",
    });
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(String(payload?.plan || ""), "pro");
    assert.match(String(payload?.email || ""), /@/);
    assert.equal(typeof payload?.licenseKeyMasked, "string");
    assert.equal(String(payload?.device_id || ""), deviceId);
  },
);
