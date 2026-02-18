// background.mjs
import { ensureValidSession, getSession } from "./lib/supabaseAuth.mjs";
import {
  canInjectOrToggle,
  enableGroup,
  disableGroup,
  listGroups,
  listEnabledGroups,
  removeGroup,
  getActiveCount,
  setActiveProfileId,
  getSettings,
} from "./lib/db.mjs";
import {
  listProfiles,
  upsertProfile,
  removeProfile,
  getProfile,
  ensureDefaultProfilesPersisted,
} from "./lib/profiles.mjs";
import { CONFIG } from "./lib/config.mjs";

const AUTORUN_KEY = "autorun_v1";
const AUTORUN_ALARM = "autorun_tick";

// ------------------------
// lifecycle
// ------------------------
chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultProfilesPersisted();
  chrome.alarms.create(AUTORUN_ALARM, { periodInMinutes: 1 });
});

chrome.action.onClicked.addListener(async () => {
  const session = await ensureValidSession();
  if (!session?.user) {
    chrome.tabs.create({ url: chrome.runtime.getURL("auth/login.html") });
    return;
  }
  chrome.tabs.create({
    url: chrome.runtime.getURL("dashboard/dashboard.html"),
  });
});

// ------------------------
// notifications
// ------------------------
function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "assets/icon.png",
    title,
    message,
  });
}

chrome.notifications.onClicked.addListener(() => {
  chrome.tabs.create({
    url: chrome.runtime.getURL("dashboard/dashboard.html"),
  });
});

// ------------------------
// auth + state
// ------------------------
async function requireAuth() {
  const session = await ensureValidSession();
  return session?.user ? session : null;
}

async function getAutorunState() {
  const { [AUTORUN_KEY]: st } = await chrome.storage.local.get(AUTORUN_KEY);
  return (
    st ?? {
      running: false,
      windowId: null, // runner window
      index: 0,
      intervalMs: 60_000,
      lastRunAt: 0,
      activeRunId: null,
      busy: false,
      watchdogAt: 0,
    }
  );
}

async function setAutorunState(patch) {
  const cur = await getAutorunState();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [AUTORUN_KEY]: next });
  return next;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getRunnerTabId(windowId) {
  try {
    const w = await chrome.windows.get(windowId, { populate: true });
    const tab = w?.tabs?.[0];
    return tab?.id || null;
  } catch {
    return null;
  }
}

async function ensureRunnerWindow(urlToOpen) {
  const st = await getAutorunState();

  // 1) se window existe, reusa e troca URL na tab 0
  if (st.windowId) {
    try {
      const tabId = await getRunnerTabId(st.windowId);
      if (tabId) {
        await chrome.tabs.update(tabId, { url: urlToOpen, active: true });
        return { windowId: st.windowId, tabId };
      }
      // window existe mas sem tab? (raro) -> recria
    } catch {}
  }

  // 2) cria window já com a URL do grupo (NADA de about:blank)
  const w = await chrome.windows.create({
    url: urlToOpen,
    type: "popup",
    focused: false,
    width: 520,
    height: 760,
    left: 30,
    top: 30,
  });

  const tabId = w?.tabs?.[0]?.id || null;

  await setAutorunState({ windowId: w.id });
  return { windowId: w.id, tabId };
}

async function waitTabComplete(tabId, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t?.status === "complete") return true;
    } catch {
      return false;
    }
    await sleep(250);
  }
  return false;
}

async function sendToTabWithRetry(tabId, msg, tries = 18, gapMs = 350) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, msg);
      if (res?.ok) return true;
      return false;
    } catch {}
    await sleep(gapMs);
  }
  return false;
}

// ------------------------
// autorun tick (window-only)
// ------------------------
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTORUN_ALARM) return;

  const session = await ensureValidSession();
  if (!session?.user) return;

  const st = await getAutorunState();
  if (!st.running) return;

  // watchdog: destrava travado
  if (st.busy && st.watchdogAt && Date.now() - st.watchdogAt > 90_000) {
    await setAutorunState({ busy: false, activeRunId: null, watchdogAt: 0 });
  }
  if (st.busy) return;

  const now = Date.now();
  if (st.lastRunAt && now - st.lastRunAt < (st.intervalMs || 0)) return;

  const enabled = await listEnabledGroups();
  if (!enabled.length) {
    await setAutorunState({ lastRunAt: now });
    return;
  }

  const idx = Math.abs(st.index || 0) % enabled.length;
  const target = enabled[idx];

  const runId =
    (globalThis.crypto && crypto.randomUUID && crypto.randomUUID()) ||
    `run_${Date.now()}_${Math.random().toString(16).slice(2)}`;

  await setAutorunState({
    busy: true,
    watchdogAt: Date.now(),
    activeRunId: runId,
  });

  // ✅ garante window e já navega no grupo (sem abrir tab extra)
  const { tabId } = await ensureRunnerWindow(target.url);

  if (!tabId) {
    await setAutorunState({
      busy: false,
      activeRunId: null,
      watchdogAt: 0,
      lastRunAt: now,
    });
    return;
  }

  await waitTabComplete(tabId, 25000);

  // dispara scraper
  await sendToTabWithRetry(tabId, { type: "SCRAPER_START", runId });
});

// ------------------------
// messages
// ------------------------
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "AUTH_STATUS") {
      const session = await getSession();
      sendResponse({ ok: true, session });
      return;
    }

    if (msg?.type === "OPPORTUNITY_FOUND") {
      const payload = msg.payload || {};
      const groupUrl = payload.groupUrl || payload.group_url || "";
      const profileName = payload.profileName || "perfil";

      const post = payload.post || {};
      const autor = post.autor || "?";
      const texto = post.texto || "";
      const postUrl = post.postUrl || post.url || "";
      const autorUrl = post.autorUrl || "";

      notify(
        `Oportunidade detectada (${profileName})`,
        `${autor}: ${texto.slice(0, 120)}...`,
      );

      // ✅ salva no storage (pro dashboard)
      const { leads = [] } = await chrome.storage.local.get({ leads: [] });
      const arr = Array.isArray(leads) ? leads : [];

      const key = postUrl
        ? `u:${postUrl}`
        : `t:${String(texto).slice(0, 120).toLowerCase()}`;

      const exists = arr.some((l) => l?.key === key);
      if (exists) {
        sendResponse({ ok: true, deduped: true });
        return;
      }

      arr.push({
        key,
        timestamp: Date.now(),
        slug: payload.slug || null,
        groupUrl,
        profileName,
        post: {
          autor,
          autorUrl,
          texto,
          postUrl,
          timestamp: post.timestamp || Date.now(),
        },
      });

      await chrome.storage.local.set({ leads: arr });

      sendResponse({ ok: true, saved: true });
      return;
    }

    // ✅ encerra ciclo e libera próximo tick
    if (msg?.type === "SCRAPER_DONE") {
      const st = await getAutorunState();
      const now = Date.now();

      const doneRunId = msg?.payload?.runId || null;
      if (st.activeRunId && doneRunId && st.activeRunId !== doneRunId) {
        sendResponse({ ok: true, ignored: true });
        return;
      }

      await setAutorunState({
        busy: false,
        watchdogAt: 0,
        index: (st.index || 0) + 1,
        lastRunAt: now,
        activeRunId: null,
      });

      sendResponse({ ok: true, advanced: true });
      return;
    }

    const session = await requireAuth();
    if (!session) {
      sendResponse({ ok: false, code: "NOT_AUTHENTICATED" });
      return;
    }

    switch (msg.type) {
      case "GROUP_CAN_INJECT": {
        const r = await canInjectOrToggle(msg.slug);
        const activeCount = await getActiveCount();
        sendResponse({
          ok: true,
          allowed: r.allowed,
          existing: r.existing,
          activeCount,
          limit: CONFIG.MAX_ACTIVE_GROUPS,
        });
        return;
      }

      case "GROUP_ENABLE": {
        const group = await enableGroup({ slug: msg.slug, url: msg.url });
        notify("Notificações ativadas", `Grupo: ${group.slug}`);
        sendResponse({ ok: true, group });
        return;
      }

      case "GROUP_DISABLE": {
        const group = await disableGroup(msg.slug);
        notify("Notificações desativadas", `Grupo: ${msg.slug}`);
        sendResponse({ ok: true, group });
        return;
      }

      case "DB_LIST_GROUPS": {
        const groups = await listGroups();
        sendResponse({ ok: true, groups });
        return;
      }

      case "DB_REMOVE_GROUP": {
        const removed = await removeGroup(msg.slug);
        sendResponse({ ok: true, removed });
        return;
      }

      case "SETTINGS_GET": {
        const settings = await getSettings();
        sendResponse({ ok: true, settings });
        return;
      }

      case "SETTINGS_SET_ACTIVE_PROFILE": {
        const settings = await setActiveProfileId(msg.profileId);
        sendResponse({ ok: true, settings });
        return;
      }

      case "PROFILES_LIST": {
        const profiles = await listProfiles();
        sendResponse({ ok: true, profiles });
        return;
      }

      case "PROFILES_GET": {
        const profile = await getProfile(msg.id);
        sendResponse({ ok: true, profile });
        return;
      }

      case "PROFILES_UPSERT": {
        const saved = await upsertProfile(msg.profile);
        sendResponse({ ok: true, profile: saved });
        return;
      }

      case "PROFILES_REMOVE": {
        const removed = await removeProfile(msg.id);
        sendResponse({ ok: true, removed });
        return;
      }

      case "AUTORUN_STATUS": {
        const st = await getAutorunState();
        sendResponse({ ok: true, state: st });
        return;
      }

      case "AUTORUN_START": {
        const intervalMs = Math.max(60_000, Number(msg.intervalMs || 60_000));
        const st = await setAutorunState({
          running: true,
          intervalMs,
          lastRunAt: 0,
          busy: false,
          watchdogAt: 0,
          activeRunId: null,
          windowId: null, // ✅ zera pra não reaproveitar lixo
          index: 0,
        });
        notify("Autorun", "Iniciado");
        sendResponse({ ok: true, state: st });
        return;
      }

      case "AUTORUN_STOP": {
        const st0 = await getAutorunState();

        await setAutorunState({
          running: false,
          busy: false,
          watchdogAt: 0,
          activeRunId: null,
        });

        // opcional: fecha runner window
        if (st0?.windowId) {
          try {
            await chrome.windows.remove(st0.windowId);
          } catch {}
          await setAutorunState({ windowId: null });
        }

        notify("Autorun", "Pausado");
        sendResponse({ ok: true });
        return;
      }

      case "AUTORUN_RESET": {
        const st = await setAutorunState({ index: 0, lastRunAt: 0 });
        sendResponse({ ok: true, state: st });
        return;
      }

      default:
        sendResponse({ ok: false, code: "UNKNOWN_MESSAGE" });
        return;
    }
  })().catch((e) => sendResponse({ ok: false, code: e?.message || "ERROR" }));

  return true;
});
