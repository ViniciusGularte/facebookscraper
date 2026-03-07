export function buildDefaultNotificationSettings() {
  return {
    notifyBrowser: true,
    notifyWebhook: false,
    notifyTelegram: false,
    webhookUrl: "",
    telegramChatId: "",
  };
}

export function buildLocalFreePlanState(now = Date.now()) {
  return {
    plan: "free",
    trialEnd: 0,
    purchaseDate: 0,
    cachedAt: now,
    source: "local",
  };
}

export function buildWorkspaceResetState(defaultFrequency, now = Date.now()) {
  return {
    selectedGroupIds: [],
    savedProfiles: [],
    selectedProfileId: "",
    leadsHistory: [],
    onboardingState: "welcome",
    onboardingAutoGroupLoadAttempted: false,
    onboardingGroupsProgress: {
      started: false,
      lastCount: 0,
      lastAnnouncedAt: 0,
    },
    globalMonitorFrequency: {
      min: Number(defaultFrequency?.min) || 15,
      max: Number(defaultFrequency?.max) || 20,
    },
    notificationSettings: buildDefaultNotificationSettings(),
    planState: buildLocalFreePlanState(now),
  };
}
