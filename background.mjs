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

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaultProfilesPersisted();

  // tick a cada 1 min; intervalo real é controlado por intervalMs no state
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

async function requireAuth() {
  const session = await ensureValidSession();
  return session?.user ? session : null;
}

async function getAutorunState() {
  const { [AUTORUN_KEY]: st } = await chrome.storage.local.get(AUTORUN_KEY);
  return (
    st ?? {
      running: false,
      tabId: null,
      index: 0,
      intervalMs: 1 * 60 * 1000, // 5 min default
      lastRunAt: 0,
    }
  );
}

async function setAutorunState(patch) {
  const cur = await getAutorunState();
  const next = { ...cur, ...patch };
  await chrome.storage.local.set({ [AUTORUN_KEY]: next });
  return next;
}

async function ensureAutorunTab(tabId) {
  if (tabId) {
    try {
      const t = await chrome.tabs.get(tabId);
      if (t?.id) return t.id;
    } catch {
      // caiu
    }
  }
  const t = await chrome.tabs.create({ url: "about:blank", active: false });
  return t.id;
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== AUTORUN_ALARM) return;

  const session = await ensureValidSession();
  if (!session?.user) return;

  const st = await getAutorunState();
  if (!st.running) return;

  // respeita intervalo configurado
  const now = Date.now();
  if (st.lastRunAt && now - st.lastRunAt < (st.intervalMs || 0)) return;

  const enabled = await listEnabledGroups();
  if (!enabled.length) {
    await setAutorunState({ lastRunAt: now });
    return;
  }

  const idx = Math.abs(st.index || 0) % enabled.length;
  const target = enabled[idx];

  const tabId = await ensureAutorunTab(st.tabId);

  await chrome.tabs.update(tabId, { url: target.url, active: false });

  await setAutorunState({
    tabId,
    index: idx + 1,
    lastRunAt: now,
  });

  // opcional: notificação leve
  // notify("Autorun", `Abrindo: ${target.slug}`);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg?.type === "AUTH_STATUS") {
      const session = await getSession();
      sendResponse({ ok: true, session });
      return;
    }

    // recebe achado do content scraper (sem bloquear por auth gate, mas você pode exigir)
    if (msg?.type === "OPPORTUNITY_FOUND") {
      const payload = msg.payload || {};
      const groupUrl = payload.groupUrl || payload.group_url || "";
      const profileName = payload.profileName || "perfil";

      const post = payload.post || {};
      const autor = post.autor || "?";
      const texto = post.texto || "";
      const postUrl = post.postUrl || post.url || "";
      const autorUrl = post.autorUrl || "";

      // notificação
      notify(
        `Oportunidade detectada (${profileName})`,
        `${autor}: ${texto.slice(0, 120)}...`,
      );

      // dedupe simples (por postUrl se existir, senão por texto)
      chrome.storage.local.get({ leads: [] }, (data) => {
        const leads = Array.isArray(data.leads) ? data.leads : [];

        const key = postUrl
          ? `u:${postUrl}`
          : `t:${texto.slice(0, 120).toLowerCase()}`;

        const exists = leads.some((l) => l?.key === key);
        if (exists) {
          sendResponse({ ok: true, deduped: true });
          return;
        }

        leads.push({
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

        chrome.storage.local.set({ leads }, () => {
          sendResponse({ ok: true });
        });
      });

      return true; // async
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

      // ---- AUTORUN API ----
      case "AUTORUN_STATUS": {
        const st = await getAutorunState();
        sendResponse({ ok: true, state: st });
        return;
      }

      case "AUTORUN_START": {
        const intervalMs = Math.max(60_000, Number(msg.intervalMs || 300_000)); // min 1 min
        const st = await setAutorunState({ running: true, intervalMs });
        notify("Autorun", "Iniciado");
        sendResponse({ ok: true, state: st });
        return;
      }

      case "AUTORUN_STOP": {
        const st = await setAutorunState({ running: false });
        notify("Autorun", "Pausado");
        sendResponse({ ok: true, state: st });
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
  })().catch((err) => {
    sendResponse({ ok: false, code: err?.message || "ERROR" });
  });

  return true;
});
