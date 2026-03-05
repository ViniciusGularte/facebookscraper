import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const functionPath = resolve(process.cwd(), "supabase/functions/validate-license/index.ts");
const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260303_create_licenses.sql",
);

const functionSource = readFileSync(functionPath, "utf8");
const migrationSource = readFileSync(migrationPath, "utf8");

test("validate-license supports activate status and start_trial actions", () => {
  assert.match(functionSource, /"activate"/);
  assert.match(functionSource, /"status"/);
  assert.match(functionSource, /"start_trial"/);
  assert.match(functionSource, /"release_device"/);
  assert.match(functionSource, /https:\/\/api\.gumroad\.com\/v2\/licenses\/verify/);
  assert.match(functionSource, /GUMROAD_PRODUCT_ID/);
  assert.match(functionSource, /product_id/);
});

test("validate-license persists normalized license and device fields", () => {
  assert.match(functionSource, /licenseKeyMasked/);
  assert.match(functionSource, /trial_device_id/);
  assert.match(functionSource, /trial_end/);
  assert.match(functionSource, /purchase_date/);
  assert.match(functionSource, /\.from\("licenses"\)/);
  assert.match(functionSource, /\.from\("license_devices"\)/);
  assert.match(functionSource, /DEVICE_STALE_AFTER_HOURS/);
  assert.match(functionSource, /LICENSE_IN_USE/);
  assert.match(functionSource, /Trial already used on this device/);
  assert.match(functionSource, /device_id/);
});

test("licenses migration creates the expected table shapes", () => {
  assert.match(migrationSource, /create table if not exists public\.licenses/i);
  assert.match(migrationSource, /email text not null unique/i);
  assert.match(migrationSource, /plan text not null default 'free'/i);
  assert.match(migrationSource, /trial_device_id text/i);
  assert.match(migrationSource, /trial_end timestamptz/i);
  assert.match(migrationSource, /purchase_date timestamptz/i);
  assert.match(migrationSource, /licenses_trial_device_unique_idx/i);
  assert.match(migrationSource, /create table if not exists public\.license_devices/i);
  assert.match(migrationSource, /device_id text not null/i);
  assert.match(migrationSource, /unique \(license_id, device_id\)/i);
  assert.match(migrationSource, /enable row level security/i);
});
