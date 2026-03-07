export function pruneNotificationClickMap(
  rawMap,
  {
    now = Date.now(),
    ttlMs,
    maxItems,
  } = {},
) {
  const map = rawMap && typeof rawMap === "object" ? { ...rawMap } : {};

  for (const [key, value] of Object.entries(map)) {
    const ts = Number(value?.createdAt || 0);
    if (!ts || (typeof ttlMs === "number" && now - ts > ttlMs)) {
      delete map[key];
    }
  }

  const entries = Object.entries(map);
  if (typeof maxItems === "number" && entries.length > maxItems) {
    entries
      .sort((a, b) => Number(a[1]?.createdAt || 0) - Number(b[1]?.createdAt || 0))
      .slice(0, entries.length - maxItems)
      .forEach(([key]) => delete map[key]);
  }

  return map;
}

export function upsertNotificationClickTarget(
  rawMap,
  notificationId,
  url,
  options = {},
) {
  if (!notificationId || !url) return pruneNotificationClickMap(rawMap, options);
  const now = options.now ?? Date.now();
  const map = pruneNotificationClickMap(rawMap, { ...options, now });
  map[notificationId] = { url, createdAt: now };
  return pruneNotificationClickMap(map, { ...options, now });
}

export function consumeNotificationClickTarget(rawMap, notificationId, options = {}) {
  const map = pruneNotificationClickMap(rawMap, options);
  if (!notificationId || !map[notificationId]?.url) {
    return { url: "", map };
  }

  const url = map[notificationId].url;
  delete map[notificationId];
  return { url, map };
}
