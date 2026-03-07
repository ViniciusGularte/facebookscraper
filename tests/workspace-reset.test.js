import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDefaultNotificationSettings,
  buildLocalFreePlanState,
  buildWorkspaceResetState,
} from "../src/panel/workspace-reset.js";

test("buildDefaultNotificationSettings returns safe defaults", () => {
  assert.deepEqual(buildDefaultNotificationSettings(), {
    notifyBrowser: true,
    notifyWebhook: false,
    notifyTelegram: false,
    webhookUrl: "",
    telegramChatId: "",
  });
});

test("buildLocalFreePlanState seeds a local free plan cache entry", () => {
  assert.deepEqual(buildLocalFreePlanState(1234), {
    plan: "free",
    trialEnd: 0,
    purchaseDate: 0,
    cachedAt: 1234,
    source: "local",
  });
});

test("buildWorkspaceResetState clears local workspace and restores free defaults", () => {
  const result = buildWorkspaceResetState({ min: 15, max: 20 }, 9999);

  assert.deepEqual(result.selectedGroupIds, []);
  assert.deepEqual(result.savedProfiles, []);
  assert.equal(result.selectedProfileId, "");
  assert.deepEqual(result.leadsHistory, []);
  assert.equal(result.onboardingState, "welcome");
  assert.equal(result.onboardingAutoGroupLoadAttempted, false);
  assert.deepEqual(result.globalMonitorFrequency, { min: 15, max: 20 });
  assert.deepEqual(result.notificationSettings, buildDefaultNotificationSettings());
  assert.deepEqual(result.planState, buildLocalFreePlanState(9999));
});
