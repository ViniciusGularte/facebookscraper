import { listEnabledGroups } from "./db.mjs";

/**
 * Abre os grupos habilitados em sequência.
 * Sem scraping aqui.
 */
export async function openEnabledGroupsSequentially({
  delayMs = 1200,
  maxToOpen = 50,
  reuseTab = true
} = {}) {
  const groups = (await listEnabledGroups()).slice(0, maxToOpen);

  let tabId = null;

  for (const g of groups) {
    if (reuseTab) {
      if (tabId) {
        await chrome.tabs.update(tabId, { url: g.url, active: false });
      } else {
        const t = await chrome.tabs.create({ url: g.url, active: false });
        tabId = t.id;
      }
    } else {
      await chrome.tabs.create({ url: g.url, active: false });
    }

    await sleep(delayMs);
  }

  return { opened: groups.length };
}

/**
 * Stub do scraper (ponto de encaixe).
 */
export async function scraperStub() {
  return;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
