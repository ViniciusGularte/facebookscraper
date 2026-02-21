import test from "node:test";
import assert from "node:assert/strict";
import { I18N } from "../src/panel/i18n-dict.js";

test("i18n has required locales", () => {
  assert.equal(typeof I18N.en, "object");
  assert.equal(typeof I18N["pt-br"], "object");
});

test("pt-br includes all en keys", () => {
  const enKeys = Object.keys(I18N.en);
  const ptKeys = new Set(Object.keys(I18N["pt-br"]));

  const missing = enKeys.filter((key) => !ptKeys.has(key));
  assert.deepEqual(missing, []);
});

test("i18n has core UX keys in both locales", () => {
  const mustHave = [
    "home.machine_on",
    "home.pause_monitoring",
    "home.checking_groups",
    "groups.monitored_count",
    "groups.show_list",
    "settings.advanced_title",
    "settings.frequency_reco",
    "settings.change_frequency",
    "settings.sleep_title",
    "settings.frequency_title",
    "settings.notifications_title",
    "profiles.watch_required",
    "monitor.start",
    "monitor.stop",
  ];

  for (const key of mustHave) {
    assert.ok(I18N.en[key]);
    assert.ok(I18N["pt-br"][key]);
  }
});

test("i18n values are non-empty strings for shared keys", () => {
  const enKeys = Object.keys(I18N.en);
  const pt = I18N["pt-br"];

  for (const key of enKeys) {
    assert.equal(typeof I18N.en[key], "string", `en key ${key} must be string`);
    assert.equal(typeof pt[key], "string", `pt-br key ${key} must be string`);
    assert.notEqual(I18N.en[key].trim(), "", `en key ${key} must not be empty`);
    assert.notEqual(pt[key].trim(), "", `pt-br key ${key} must not be empty`);
  }
});

test("i18n placeholder tokens are consistent between en and pt-br", () => {
  const tokenRegex = /\{([a-zA-Z0-9_]+)\}/g;
  const getTokens = (value) => {
    const set = new Set();
    for (const match of String(value).matchAll(tokenRegex)) {
      if (match?.[1]) set.add(match[1]);
    }
    return Array.from(set).sort();
  };

  for (const key of Object.keys(I18N.en)) {
    const enTokens = getTokens(I18N.en[key]);
    const ptTokens = getTokens(I18N["pt-br"][key]);
    assert.deepEqual(
      ptTokens,
      enTokens,
      `placeholder mismatch for key: ${key}`,
    );
  }
});
