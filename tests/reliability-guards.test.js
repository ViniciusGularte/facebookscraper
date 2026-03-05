import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { I18N } from "../src/panel/i18n-dict.js";

const panelPath = resolve(process.cwd(), "src/panel/app.js");
const backgroundPath = resolve(process.cwd(), "src/background/core.js");
const panelSource = readFileSync(panelPath, "utf8");
const backgroundSource = readFileSync(backgroundPath, "utf8");

test("ui error mapper handles network/offline fetch failures", () => {
  assert.match(
    panelSource,
    /failed to fetch\|networkerror\|network request failed/i,
  );
  assert.match(
    panelSource,
    /Falha de conexão\. Verifique a internet e tente novamente\./,
  );
  assert.match(
    panelSource,
    /Connection failed\. Check your internet and try again\./,
  );
});

test("monitor error classifier maps facebook disconnected cases", () => {
  assert.match(panelSource, /function classifyMonitorError\(/);
  assert.match(panelSource, /nenhuma aba do facebook aberta/i);
  assert.match(panelSource, /facebook tab was closed/i);
  assert.match(panelSource, /not logged in/i);
  assert.match(panelSource, /session expired/i);
});

test("license refresh flow always hits the edge function with stored credentials", () => {
  assert.match(panelSource, /function refreshLicenseState\(/);
  assert.match(panelSource, /const email = String\(session\?\.email \|\| ""\)/);
  assert.match(panelSource, /const licenseKey = String\(session\?\.licenseKey \|\| ""\)/);
  assert.match(panelSource, /action: "status"/);
});

test("license state is normalized before being cached locally", () => {
  assert.match(panelSource, /function normalizeLicenseState\(/);
  assert.match(panelSource, /function normalizeLicensePlan\(/);
  assert.match(panelSource, /licenseKeyMasked/);
  assert.match(panelSource, /cachedPlanState = \{/);
});

test("background has explicit facebook-tab and timeout protection", () => {
  assert.match(
    backgroundSource,
    /Nenhuma aba do Facebook aberta\. Abra facebook\.com e tente novamente\./,
  );
  assert.match(backgroundSource, /function postJsonWithTimeout\(/);
  assert.match(backgroundSource, /AbortController/);
  assert.match(backgroundSource, /setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);
});

test("i18n includes guidance key for facebook reconnect in both locales", () => {
  assert.equal(typeof I18N.en["status.open_facebook_hint"], "string");
  assert.equal(typeof I18N["pt-br"]["status.open_facebook_hint"], "string");
  assert.notEqual(I18N.en["status.open_facebook_hint"].trim(), "");
  assert.notEqual(I18N["pt-br"]["status.open_facebook_hint"].trim(), "");
});
