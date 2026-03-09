function normalizeKeywordList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
}

export function normalizeMonitorConfig(payload = {}) {
  return {
    selectedGroupIds: Array.isArray(payload.selectedGroupIds)
      ? payload.selectedGroupIds.map((value) => String(value))
      : [],
    positiveKeywords: normalizeKeywordList(payload.positiveKeywords),
    negativeKeywords: normalizeKeywordList(payload.negativeKeywords),
    profileName: String(payload.profileName || "").trim(),
    minMinutes: Number(payload.minMinutes) || 3,
    maxMinutes: Number(payload.maxMinutes) || 8,
  };
}

export function buildMonitorStateResponse(runtime = {}, liveState = {}) {
  return {
    success: true,
    running: !!runtime.running || !!liveState.isMonitorRunning,
    sleepModeActive: !!runtime.sleepModeActive || !!liveState.isSleepModeActive,
    config: runtime.config || liveState.monitorConfig || null,
    connectionIssue: runtime.connectionIssue || liveState.monitorConnectionIssue || null,
  };
}
