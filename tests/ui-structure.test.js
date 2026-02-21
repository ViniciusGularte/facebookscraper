import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const indexHtmlPath = path.resolve(__dirname, "../index.html");
const html = fs.readFileSync(indexHtmlPath, "utf8");

test("home includes primary system-state card with main monitor toggle", () => {
  assert.match(html, /id="cardSystemState"/);
  assert.match(html, /id="systemStateHeadline"/);
  assert.match(html, /id="btnMainMonitorToggle"/);
});

test("groups list is directly visible without extra show-list toggle", () => {
  assert.match(html, /id="groupsList"/);
  assert.doesNotMatch(html, /id="groupsListWrap"/);
  assert.doesNotMatch(html, /id="btnToggleGroupsList"/);
});

test("advanced settings keep frequency options visible after expanding", () => {
  assert.match(html, /<details[^>]*id="advancedSettings"[^>]*>/);
  assert.doesNotMatch(html, /id="btnToggleFrequencyDetails"/);
  assert.match(
    html,
    /<div[^>]*id="settingsFrequencyDetails"[^>]*class="[^"]*frequency-options[^"]*"|<div[^>]*class="[^"]*frequency-options[^"]*"[^>]*id="settingsFrequencyDetails"/,
  );
  assert.doesNotMatch(
    html,
    /id="settingsFrequencyDetails"[^>]*class="[^"]*collapsed[^"]*"|class="[^"]*collapsed[^"]*"[^>]*id="settingsFrequencyDetails"/,
  );
});
