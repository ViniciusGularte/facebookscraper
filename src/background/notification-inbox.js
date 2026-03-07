export function pruneNotificationInbox(
  items,
  {
    now = Date.now(),
    ttlMs,
    maxItems,
  } = {},
) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => item && typeof item === "object")
    .filter((item) => {
      const createdAt = Number(item.createdAt || 0);
      return createdAt > 0 && (typeof ttlMs !== "number" || now - createdAt <= ttlMs);
    })
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, typeof maxItems === "number" ? maxItems : undefined);
}

export function buildNotificationCounters(items) {
  const inbox = Array.isArray(items) ? items : [];
  return {
    total: inbox.length,
    unread: inbox.filter((item) => !Number(item?.seenAt || 0)).length,
  };
}

export function appendNotificationInboxItem(
  inbox,
  item,
  options = {},
) {
  const nextInbox = pruneNotificationInbox([item, ...(Array.isArray(inbox) ? inbox : [])], options);
  return {
    inbox: nextInbox,
    counters: buildNotificationCounters(nextInbox),
  };
}
