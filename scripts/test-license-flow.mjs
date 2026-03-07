#!/usr/bin/env node

import fs from "node:fs";

const DEFAULT_PROJECT_URL = "https://hfnwpzglvbzkvhrcwmet.supabase.co";
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

function assertEnv(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

async function callLicense({ projectUrl, anonKey, body }) {
  const response = await fetch(`${projectUrl}${LICENSE_PATH}`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

async function main() {
  loadDotEnv();

  const projectUrl = String(process.env.SUPABASE_URL || DEFAULT_PROJECT_URL).trim();
  const anonKey = assertEnv("SUPABASE_ANON_KEY");
  const paidKey = String(process.env.TEST_LICENSE_KEY || "").trim();
  const trialEmail = String(
    process.env.TEST_TRIAL_EMAIL || `trial-${Date.now()}@example.com`,
  )
    .trim()
    .toLowerCase();
  const trialDeviceId = `trial-device-${Date.now()}`;
  const paidDeviceId = `paid-device-${Date.now()}`;

  console.log("1) Trial start...");
  const trial = await callLicense({
    projectUrl,
    anonKey,
    body: {
      action: "start_trial",
      email: trialEmail,
      deviceId: trialDeviceId,
      deviceName: "CLI Trial Device",
      trialDays: 2,
    },
  });
  console.log(`   status=${trial.status} payload=${JSON.stringify(trial.payload)}`);
  if (trial.status !== 200 || !["trial", "pro"].includes(String(trial.payload?.plan || ""))) {
    throw new Error("Trial start failed.");
  }

  console.log("2) Trial status...");
  const trialStatus = await callLicense({
    projectUrl,
    anonKey,
    body: {
      action: "status",
      email: trialEmail,
      deviceId: trialDeviceId,
      deviceName: "CLI Trial Device",
    },
  });
  console.log(
    `   status=${trialStatus.status} payload=${JSON.stringify(trialStatus.payload)}`,
  );
  if (trialStatus.status !== 200) {
    throw new Error("Trial status failed.");
  }

  if (paidKey) {
    console.log("3) Paid license activation...");
    const activate = await callLicense({
      projectUrl,
      anonKey,
      body: {
        action: "activate",
        licenseKey: paidKey,
        deviceId: paidDeviceId,
        deviceName: "CLI Paid Device",
      },
    });
    console.log(`   status=${activate.status} payload=${JSON.stringify(activate.payload)}`);
    if (activate.status !== 200 || String(activate.payload?.plan || "") !== "pro") {
      throw new Error("Paid license activation failed.");
    }

    console.log("4) Paid license status...");
    const paidStatus = await callLicense({
      projectUrl,
      anonKey,
      body: {
        action: "status",
        licenseKey: paidKey,
        deviceId: paidDeviceId,
        deviceName: "CLI Paid Device",
      },
    });
    console.log(
      `   status=${paidStatus.status} payload=${JSON.stringify(paidStatus.payload)}`,
    );
    if (paidStatus.status !== 200 || String(paidStatus.payload?.plan || "") !== "pro") {
      throw new Error("Paid license status failed.");
    }

    console.log("5) Releasing paid device...");
    const released = await callLicense({
      projectUrl,
      anonKey,
      body: {
        action: "release_device",
        licenseKey: paidKey,
        deviceId: paidDeviceId,
      },
    });
    console.log(`   status=${released.status} payload=${JSON.stringify(released.payload)}`);
    if (released.status !== 200 || !released.payload?.released) {
      throw new Error("Paid device release failed.");
    }
  } else {
    console.log("3) Paid activation skipped. Set TEST_LICENSE_KEY.");
  }

  console.log("License flow checks passed.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
