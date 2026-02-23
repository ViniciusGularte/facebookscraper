import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { I18N } from "../src/panel/i18n-dict.js";

const panelPath = resolve(process.cwd(), "src/panel/app.js");
const backgroundPath = resolve(process.cwd(), "src/background/core.js");
const manifestPath = resolve(process.cwd(), "manifest.json");
const indexHtmlPath = resolve(process.cwd(), "index.html");

const panelSource = readFileSync(panelPath, "utf8");
const backgroundSource = readFileSync(backgroundPath, "utf8");
const manifestRaw = readFileSync(manifestPath, "utf8");
const manifest = JSON.parse(manifestRaw);
const indexHtml = readFileSync(indexHtmlPath, "utf8");

test("auth flow validates email and otp code format", () => {
  assert.match(panelSource, /if \(!\/\^\[\^@\\s\]\+\@\[\^@\\s\]\+\\\.\[\^@\\s\]\+\$\/\.test\(email\)\)/);
  assert.match(panelSource, /if \(!\/\^\\d\{6\}\$\/\.test\(code\)\)/);
  assert.match(panelSource, /translate\("auth\.invalid_email"\)/);
  assert.match(panelSource, /translate\("auth\.invalid_code"\)/);
});

test("auth continue uses otp create-user path and resend cooldown", () => {
  assert.match(panelSource, /await sendEmailOtpCode\(email, true\)/);
  assert.match(panelSource, /qs\("btnAuthResend"\)\.disabled = true/);
  assert.match(panelSource, /setTimeout\(\(\) => \{\s*qs\("btnAuthResend"\)\.disabled = false;\s*\}, 60000\)/);
});

test("session persistence and cleanup paths are present", () => {
  assert.match(panelSource, /function getAuthSession\(/);
  assert.match(panelSource, /function setAuthSession\(/);
  assert.match(panelSource, /function clearAuthSession\(/);
  assert.match(panelSource, /STORAGE_AUTH_SESSION_KEY/);
  assert.match(panelSource, /STORAGE_AUTH_EMAIL_KEY/);
});

test("session refresh logic protects long-running usage", () => {
  assert.match(panelSource, /ensureActiveAuthSession/);
  assert.match(panelSource, /expiresAt - Date\.now\(\) < 60 \* 1000/);
  assert.match(panelSource, /refreshAuthSessionToken\(session\)/);
  assert.match(panelSource, /grant_type=refresh_token/);
});

test("checkout flow handles auth failures and malformed response", () => {
  assert.match(panelSource, /functions\/v1\/create-checkout-session/);
  assert.match(panelSource, /if \(response\.status === 401\)/);
  assert.match(panelSource, /throw new Error\(translate\("msg\.upgrade_signin_required"\)\)/);
  assert.match(panelSource, /Invalid checkout URL returned by billing service\./);
});

test("plan state polling uses cached window to reduce unnecessary requests", () => {
  assert.match(panelSource, /PLAN_CACHE_TTL_MS/);
  assert.match(panelSource, /POST_CHECKOUT_PLAN_INTERVAL_MS/);
  assert.match(panelSource, /POST_CHECKOUT_PLAN_WINDOW_MS/);
});

test("monitor classifier handles facebook-tab missing and login-required", () => {
  assert.match(panelSource, /function classifyMonitorError\(/);
  assert.match(panelSource, /nenhuma aba do facebook aberta/i);
  assert.match(panelSource, /facebook tab was closed/i);
  assert.match(panelSource, /not logged in/i);
  assert.match(panelSource, /session expired/i);
  assert.match(panelSource, /status\.open_facebook_hint/);
});

test("background enforces facebook tab context for fetches", () => {
  assert.match(backgroundSource, /const FACEBOOK_URL_PATTERNS = \[/);
  assert.match(backgroundSource, /chrome\.tabs\.query\(\{ url: FACEBOOK_URL_PATTERNS \}\)/);
  assert.match(
    backgroundSource,
    /Nenhuma aba do Facebook aberta\. Abra facebook\.com e tente novamente\./,
  );
});

test("background includes timeout protection for outbound webhooks", () => {
  assert.match(backgroundSource, /async function postJsonWithTimeout\(/);
  assert.match(backgroundSource, /const controller = new AbortController\(\)/);
  assert.match(backgroundSource, /setTimeout\(\(\) => controller\.abort\(\), timeoutMs\)/);
  assert.match(backgroundSource, /timeoutMs = 10000/);
});

test("notification channels validate required inputs", () => {
  assert.match(backgroundSource, /missing webhook url/);
  assert.match(backgroundSource, /missing chat_id/);
  assert.match(backgroundSource, /notifications API unavailable/);
});

test("groups flow has no-groups and stream progress signaling", () => {
  assert.match(backgroundSource, /if \(isEmpty && groups\.length === 0 && !cursor\)/);
  assert.match(backgroundSource, /return \{ noGroups: true, groups: \[\] \}/);
  assert.match(backgroundSource, /type: "groupsFetched"/);
  assert.match(backgroundSource, /type: "groupsChunk"/);
});

test("lead history retention and cleanup logic exists", () => {
  assert.match(backgroundSource, /LEADS_HISTORY_STORAGE_KEY/);
  assert.match(backgroundSource, /LEADS_HISTORY_TTL_MS/);
  assert.match(panelSource, /type: "clearLeadHistory"/);
  assert.match(panelSource, /btnClearHistory/);
  assert.match(panelSource, /btnClearLeadsTop/);
});

test("leads ui supports compact mode and expandable content", () => {
  assert.match(panelSource, /LEAD_PREVIEW_TRUNCATE_AT/);
  assert.match(panelSource, /LEAD_HEADLINE_TRUNCATE_AT/);
  assert.match(panelSource, /translate\("leads\.show_more"\)/);
  assert.match(panelSource, /translate\("leads\.show_less"\)/);
  assert.match(panelSource, /lead-keyword-mark/);
});

test("guided tips dismiss persistence is stored locally", () => {
  assert.match(panelSource, /guidedTipsDismissed/);
  assert.match(panelSource, /STORAGE_GUIDED_TIPS_DISMISSED_KEY/);
  assert.match(panelSource, /btnGuidedTipsDismiss/);
  assert.match(panelSource, /chrome\.storage\.local\.set\(\{ \[STORAGE_GUIDED_TIPS_DISMISSED_KEY\]: true \}\)/);
});

test("manifest follows expected minimal extension surface", () => {
  assert.equal(manifest.manifest_version, 3);
  assert.equal(typeof manifest.background?.service_worker, "string");
  assert.ok(Array.isArray(manifest.permissions));
  assert.ok(Array.isArray(manifest.host_permissions));
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("tabs"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(!manifest.permissions.includes("clipboardRead"));
  assert.ok(!manifest.permissions.includes("clipboardWrite"));
  assert.ok(!manifest.permissions.includes("management"));
  assert.ok(!manifest.host_permissions.includes("<all_urls>"));
});

test("manifest host permissions are scoped to facebook and supabase", () => {
  const hosts = manifest.host_permissions || [];
  assert.ok(hosts.includes("https://www.facebook.com/*"));
  assert.ok(hosts.includes("https://web.facebook.com/*"));
  assert.ok(hosts.includes("https://*.supabase.co/*"));
});

test("content scripts only target facebook origins", () => {
  const scripts = Array.isArray(manifest.content_scripts)
    ? manifest.content_scripts
    : [];
  assert.ok(scripts.length > 0);
  const allMatches = scripts.flatMap((entry) => entry.matches || []);
  for (const match of allMatches) {
    assert.match(match, /^https:\/\/(www|web)\.facebook\.com\//);
  }
});

test("guided setup card contains best-results and support CTAs", () => {
  assert.match(indexHtml, /id="guidedTipsBlock"/);
  assert.match(indexHtml, /id="btnGuidedTipsDismiss"/);
  assert.match(indexHtml, /data-i18n="onboard\.playbook_2"/);
  assert.match(indexHtml, /data-i18n="help\.support_cta"/);
  assert.match(indexHtml, /data-i18n="onboard\.contact_support"/);
});

test("critical i18n coverage exists for auth, network and plan lock", () => {
  const keys = [
    "auth.invalid_email",
    "auth.invalid_code",
    "auth.code_verify_failed",
    "status.open_facebook_hint",
    "msg.upgrade_signin_required",
    "msg.payment_checking",
    "plan.locked_action",
    "data.clear_lead_history",
    "onboard.playbook_title",
    "onboard.playbook_2",
    "onboard.contact_support",
  ];
  for (const key of keys) {
    assert.equal(typeof I18N.en[key], "string", `missing en key ${key}`);
    assert.equal(typeof I18N["pt-br"][key], "string", `missing pt-br key ${key}`);
    assert.notEqual(I18N.en[key].trim(), "", `empty en key ${key}`);
    assert.notEqual(I18N["pt-br"][key].trim(), "", `empty pt-br key ${key}`);
  }
});
