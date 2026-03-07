export function mergeNotificationSettings(currentSettings = {}, uiSettings = {}) {
  return {
    ...currentSettings,
    notifyBrowser: !!uiSettings.notifyBrowser,
    notifyWebhook: !!uiSettings.notifyWebhook,
    notifyTelegram: !!uiSettings.notifyTelegram,
    webhookUrl: String(uiSettings.webhookUrl || "").trim(),
    telegramChatId: String(uiSettings.telegramChatId || "").trim(),
  };
}

export function applyWebhookPermissionResult(settings, granted) {
  const next = { ...(settings || {}) };
  if (next.notifyWebhook && next.webhookUrl && !granted) {
    next.notifyWebhook = false;
    return { settings: next, permissionDenied: true };
  }
  return { settings: next, permissionDenied: false };
}
