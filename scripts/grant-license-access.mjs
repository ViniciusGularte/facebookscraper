#!/usr/bin/env node

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

function parseArgs(argv) {
  const out = {
    email: "",
    plan: "pro",
    trialDays: 2,
    licenseKey: "",
    revoke: false,
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "");
    const next = String(argv[i + 1] || "");
    if (arg === "--email") {
      out.email = next.trim().toLowerCase();
      i += 1;
    } else if (arg === "--plan") {
      out.plan = next.trim().toLowerCase();
      i += 1;
    } else if (arg === "--trial-days") {
      out.trialDays = Number(next);
      i += 1;
    } else if (arg === "--license-key") {
      out.licenseKey = next.trim();
      i += 1;
    } else if (arg === "--revoke") {
      out.revoke = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    }
  }

  return out;
}

function addDaysIso(days) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function maskLicenseKey(licenseKey) {
  if (!licenseKey) return null;
  if (licenseKey.length <= 8) return licenseKey;
  return `${licenseKey.slice(0, 4)}...${licenseKey.slice(-4)}`;
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run grant:license -- --email user@email.com",
      "",
      "Options:",
      "  --email <value>           required",
      "  --plan <pro|trial|free>   default: pro",
      "  --trial-days <n>          default: 2",
      "  --license-key <value>     optional manual key for pro",
      "  --revoke                  shortcut for --plan free",
      "  --dry-run                 print payload, do not write",
    ].join("\n"),
  );
}

async function upsertLicense(projectUrl, serviceRoleKey, row) {
  const response = await fetch(`${projectUrl}/rest/v1/licenses`, {
    method: "POST",
    headers: {
      ...adminHeaders(serviceRoleKey),
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify(row),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      `Failed to upsert licenses (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  if (Array.isArray(payload) && payload[0]) return payload[0];
  return payload;
}

async function main() {
  await maybeLoadDotEnv();
  const args = parseArgs(process.argv);

  if (!args.email) {
    printUsage();
    process.exit(1);
  }

  if (args.revoke) args.plan = "free";

  if (!["pro", "trial", "free"].includes(args.plan)) {
    throw new Error(`Invalid --plan "${args.plan}". Use pro, trial or free.`);
  }

  const projectUrl = String(process.env.SUPABASE_URL || DEFAULT_PROJECT_URL).trim();
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");
  const nowIso = new Date().toISOString();

  const row = {
    email: args.email,
    plan: args.plan,
    license_key: args.plan === "pro" ? args.licenseKey || null : null,
    license_key_masked:
      args.plan === "pro" ? maskLicenseKey(args.licenseKey || "") : null,
    trial_start: args.plan === "trial" ? nowIso : null,
    trial_end:
      args.plan === "trial"
        ? addDaysIso(Number.isFinite(args.trialDays) ? args.trialDays : 2)
        : null,
    purchase_date: args.plan === "pro" ? nowIso : null,
    gumroad_sale_id: null,
    gumroad_product_id: null,
    gumroad_variant_id: null,
    gumroad_refunded: false,
    gumroad_disputed: false,
    raw_gumroad: null,
    updated_at: nowIso,
  };

  if (args.dryRun) {
    console.log(JSON.stringify({ dry_run: true, row }, null, 2));
    return;
  }

  const saved = await upsertLicense(projectUrl, serviceRoleKey, row);
  console.log(
    JSON.stringify(
      {
        ok: true,
        email: row.email,
        plan: row.plan,
        saved,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
