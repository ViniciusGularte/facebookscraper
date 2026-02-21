export function pickKeepTab(extTabs, preferredTabId = null) {
  if (!Array.isArray(extTabs) || extTabs.length === 0) return null;

  if (typeof preferredTabId === "number") {
    const preferred = extTabs.find((tab) => tab?.id === preferredTabId);
    if (preferred && typeof preferred.id === "number") return preferred;
  }

  const active = extTabs.find(
    (tab) => tab?.active && typeof tab?.id === "number",
  );
  if (active) return active;

  return (
    [...extTabs]
      .filter((tab) => typeof tab?.id === "number")
      .sort(
        (a, b) =>
          (Number(b?.lastAccessed) || 0) - (Number(a?.lastAccessed) || 0),
      )[0] || null
  );
}

export function getTabIdsToClose(extTabs, keepTabId) {
  if (!Array.isArray(extTabs) || typeof keepTabId !== "number") return [];
  return extTabs
    .filter((tab) => typeof tab?.id === "number" && tab.id !== keepTabId)
    .map((tab) => tab.id);
}
