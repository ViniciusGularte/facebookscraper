#!/usr/bin/env node

import { spawn } from "node:child_process";
import fs from "node:fs/promises";

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
    // ignore missing .env
  }
}

function hasAllEnv(keys) {
  return keys.every((k) => String(process.env[k] || "").trim());
}

async function runCommand(cmd, args) {
  return await new Promise((resolve) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      shell: false,
      env: process.env,
    });
    child.on("close", (code) => {
      resolve(Number.isInteger(code) ? code : 1);
    });
  });
}

async function main() {
  await maybeLoadDotEnv();

  const mode = String(process.env.RELEASE_TEST_MODE || "full").trim().toLowerCase();
  const requireAll = String(process.env.RELEASE_REQUIRE_ALL || "0").trim() === "1";

  const steps = [
    {
      name: "Unit + Guardrails",
      cmd: "npm",
      args: ["test"],
      requires: [],
      modes: ["local", "full"],
    },
    {
      name: "E2E License (node:test)",
      cmd: "npm",
      args: ["run", "test:e2e"],
      requires: [],
      modes: ["full"],
    },
    {
      name: "License Flow",
      cmd: "npm",
      args: ["run", "test:license"],
      requires: ["SUPABASE_ANON_KEY"],
      modes: ["full"],
    },
  ];

  const selected = steps.filter((s) => s.modes.includes(mode));
  if (!selected.length) {
    console.error(`Invalid RELEASE_TEST_MODE="${mode}". Use "local" or "full".`);
    process.exit(1);
  }

  const results = [];
  for (const step of selected) {
    const needed = Array.isArray(step.requires) ? step.requires : [];
    if (!hasAllEnv(needed)) {
      const missing = needed.filter((k) => !String(process.env[k] || "").trim());
      results.push({
        name: step.name,
        status: "SKIP",
        detail: `missing env: ${missing.join(", ")}`,
      });
      console.log(`\n[SKIP] ${step.name} (${missing.join(", ")})`);
      continue;
    }

    console.log(`\n[RUN ] ${step.name}`);
    const code = await runCommand(step.cmd, step.args);
    if (code === 0) {
      results.push({ name: step.name, status: "PASS", detail: "" });
      console.log(`[PASS] ${step.name}`);
    } else {
      results.push({ name: step.name, status: "FAIL", detail: `exit=${code}` });
      console.log(`[FAIL] ${step.name} (exit=${code})`);
    }
  }

  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const skipCount = results.filter((r) => r.status === "SKIP").length;

  console.log("\n=== Release Test Summary ===");
  for (const r of results) {
    const detail = r.detail ? ` :: ${r.detail}` : "";
    console.log(`${r.status} - ${r.name}${detail}`);
  }
  console.log(`Summary: ${passCount} passed / ${failCount} failed / ${skipCount} skipped`);

  if (failCount > 0) {
    process.exit(1);
  }
  if (requireAll && skipCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
