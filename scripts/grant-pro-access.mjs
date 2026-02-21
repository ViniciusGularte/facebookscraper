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
    userId: "",
    plan: "pro",
    trialDays: 3,
    refundDays: 7,
    stripeId: "",
    revokePro: false,
    clearStripeId: false,
    dryRun: false,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "");
    const next = String(argv[i + 1] || "");
    if (arg === "--email") {
      out.email = next.trim().toLowerCase();
      i += 1;
    } else if (arg === "--user-id") {
      out.userId = next.trim();
      i += 1;
    } else if (arg === "--plan") {
      out.plan = next.trim().toLowerCase();
      i += 1;
    } else if (arg === "--trial-days") {
      out.trialDays = Number(next);
      i += 1;
    } else if (arg === "--refund-days") {
      out.refundDays = Number(next);
      i += 1;
    } else if (arg === "--stripe-id") {
      out.stripeId = next.trim();
      i += 1;
    } else if (arg === "--revoke-pro") {
      out.revokePro = true;
    } else if (arg === "--clear-stripe-id") {
      out.clearStripeId = true;
    } else if (arg === "--dry-run") {
      out.dryRun = true;
    }
  }
  return out;
}

async function findAuthUserByEmail(projectUrl, serviceRoleKey, email) {
  let page = 1;
  while (page <= 10) {
    const response = await fetch(
      `${projectUrl}/auth/v1/admin/users?page=${page}&per_page=200`,
      {
        method: "GET",
        headers: adminHeaders(serviceRoleKey),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(
        `Failed to list auth users (${response.status}): ${JSON.stringify(payload)}`,
      );
    }
    const users = Array.isArray(payload?.users) ? payload.users : [];
    const found = users.find(
      (u) => String(u?.email || "").trim().toLowerCase() === email,
    );
    if (found?.id) return { id: String(found.id), email: String(found.email || "") };
    if (users.length < 200) break;
    page += 1;
  }
  return null;
}

async function fetchAuthUserById(projectUrl, serviceRoleKey, userId) {
  const response = await fetch(
    `${projectUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "GET",
      headers: adminHeaders(serviceRoleKey),
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return null;
  const user = payload?.user || payload;
  return user?.id ? { id: String(user.id), email: String(user.email || "") } : null;
}

async function upsertPublicUser(projectUrl, serviceRoleKey, row) {
  const response = await fetch(`${projectUrl}/rest/v1/users`, {
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
      `Failed to upsert users (${response.status}): ${JSON.stringify(payload)}`,
    );
  }
  if (Array.isArray(payload) && payload[0]) return payload[0];
  return payload;
}

function addDaysIso(days) {
  const now = Date.now();
  return new Date(now + days * 24 * 60 * 60 * 1000).toISOString();
}

function printUsage() {
  console.log(
    [
      "Usage:",
      "  npm run grant:pro -- --email user@email.com",
      "  npm run grant:pro -- --user-id <uuid>",
      "",
      "Options:",
      "  --email <value>         resolve user by auth email",
      "  --user-id <value>       use specific auth user id",
      "  --plan <pro|trial|free> default: pro",
      "  --revoke-pro            shortcut for --plan free",
      "  --trial-days <n>        default: 3",
      "  --refund-days <n>       default: 7 (for pro)",
      "  --stripe-id <value>     optional stripe customer id",
      "  --clear-stripe-id       set stripe_id to null",
      "  --dry-run               print payload, do not write",
    ].join("\n"),
  );
}

async function main() {
  await maybeLoadDotEnv();
  const args = parseArgs(process.argv);

  if (!args.email && !args.userId) {
    printUsage();
    process.exit(1);
  }

  if (args.revokePro) args.plan = "free";

  if (!["pro", "trial", "free"].includes(args.plan)) {
    throw new Error(`Invalid --plan "${args.plan}". Use pro, trial or free.`);
  }

  const projectUrl = String(process.env.SUPABASE_URL || DEFAULT_PROJECT_URL).trim();
  const serviceRoleKey = assertEnv("SUPABASE_SERVICE_ROLE_KEY");

  let authUser = null;
  if (args.userId) {
    authUser = await fetchAuthUserById(projectUrl, serviceRoleKey, args.userId);
  } else {
    authUser = await findAuthUserByEmail(projectUrl, serviceRoleKey, args.email);
  }

  if (!authUser?.id) {
    throw new Error("Auth user not found. Check email/user-id.");
  }

  const nowIso = new Date().toISOString();
  const row = {
    id: authUser.id,
    email: authUser.email || args.email || "",
    plan: args.plan,
    updated_at: nowIso,
  };

  if (args.stripeId) row.stripe_id = args.stripeId;
  if (args.clearStripeId) row.stripe_id = null;

  if (args.plan === "pro") {
    row.purchase_date = nowIso;
    if (Number.isFinite(args.refundDays) && args.refundDays >= 0) {
      row.refund_window = addDaysIso(args.refundDays);
    }
  }

  if (args.plan === "trial") {
    row.trial_start = nowIso;
    row.trial_end = addDaysIso(Number.isFinite(args.trialDays) ? args.trialDays : 3);
    row.purchase_date = null;
  }

  if (args.plan === "free") {
    row.purchase_date = null;
    row.refund_window = null;
  }

  if (args.dryRun) {
    console.log(JSON.stringify({ dry_run: true, row }, null, 2));
    return;
  }

  const saved = await upsertPublicUser(projectUrl, serviceRoleKey, row);
  console.log(
    JSON.stringify(
      {
        ok: true,
        user_id: authUser.id,
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
