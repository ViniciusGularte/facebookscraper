import test from "node:test";
import assert from "node:assert/strict";
import {
  applyWebhookPermissionResult,
  mergeNotificationSettings,
} from "../src/panel/notification-settings.js";

test("mergeNotificationSettings normalizes booleans and trims values from UI", () => {
  const next = mergeNotificationSettings(
    { notifyBrowser: false, notifyWebhook: false, notifyTelegram: false },
    {
      notifyBrowser: 1,
      notifyWebhook: true,
      notifyTelegram: "",
      webhookUrl: " https://example.com/hook ",
      telegramChatId: " 12345 ",
    },
  );

  assert.deepEqual(next, {
    notifyBrowser: true,
    notifyWebhook: true,
    notifyTelegram: false,
    webhookUrl: "https://example.com/hook",
    telegramChatId: "12345",
  });
});

test("applyWebhookPermissionResult disables webhook when permission is denied", () => {
  const result = applyWebhookPermissionResult(
    {
      notifyBrowser: true,
      notifyWebhook: true,
      notifyTelegram: false,
      webhookUrl: "https://example.com/hook",
      telegramChatId: "",
    },
    false,
  );

  assert.equal(result.permissionDenied, true);
  assert.equal(result.settings.notifyWebhook, false);
  assert.equal(result.settings.webhookUrl, "https://example.com/hook");
});

test("applyWebhookPermissionResult keeps webhook enabled when permission is granted", () => {
  const result = applyWebhookPermissionResult(
    {
      notifyBrowser: true,
      notifyWebhook: true,
      notifyTelegram: false,
      webhookUrl: "https://example.com/hook",
      telegramChatId: "",
    },
    true,
  );

  assert.equal(result.permissionDenied, false);
  assert.equal(result.settings.notifyWebhook, true);
});
