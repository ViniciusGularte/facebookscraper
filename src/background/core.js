/**
 * background.js — Background script da extensão Chrome
 * Responsável por:
 *  - Buscar grupos do Facebook do usuário
 *  - Buscar posts do feed de grupos
 *  - Verificar login e extrair tokens de autenticação
 *  - Obter a data de criação do perfil
 */

import { repairJson } from "./json-repair.js";
import { getTabIdsToClose, pickKeepTab } from "./extension-tabs.js";
import {
  buildLeadHistoryId,
  mergeLeadHistory,
  pruneLeadsHistory,
} from "./lead-history.js";
import {
  classifyMonitorIssueKind,
  shouldNotifyMonitorIssue,
} from "./monitor-issues.js";
import {
  buildMonitorStateResponse,
  normalizeMonitorConfig,
} from "./monitor-state.js";
import {
  consumeNotificationClickTarget as consumeClickTargetEntry,
  pruneNotificationClickMap,
  upsertNotificationClickTarget,
} from "./notification-click-map.js";
import {
  appendNotificationInboxItem,
  buildNotificationCounters,
  pruneNotificationInbox,
} from "./notification-inbox.js";
import {
  getDefaultSleepSchedule,
  getSleepModeTransition,
  normalizeSleepSchedule,
} from "./sleep-schedule.js";
// ─────────────────────────────────────────────────────────────
// UTILITÁRIOS GERAIS
// ─────────────────────────────────────────────────────────────

/**
 * Aguarda um número de milissegundos.
 * @param {number} ms
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serializa um erro em string legível.
 */
async function serializeError(error) {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error)
    return error.message;
  if (error && typeof error === "object") {
    try {
      return JSON.stringify(error);
    } catch {}
  }
  return "An unknown error occurred.";
}

/**
 * Envia uma mensagem de log para o front-end (popup).
 * Fallback para console.log se o runtime não estiver disponível.
 */
function log(message, ...args) {
  const timestamp = new Date().toLocaleTimeString();
  const fullMessage =
    args.length > 0
      ? `${message} ${args
          .map((a) => {
            if (a instanceof Error) return a.stack || a.message;
            if (typeof a === "object") return JSON.stringify(a, null, 2);
            return String(a);
          })
          .join(" ")}`
      : message;

  try {
    chrome.runtime.sendMessage({
      type: "backgroundLog",
      timestamp,
      message: fullMessage,
    });
  } catch {
    console.log(`[${timestamp}] ${fullMessage}`);
  }
}

/**
 * Envia uma mensagem de erro ao front-end.
 */
async function sendErrorToFrontend(errorMessage, severity) {
  try {
    chrome.runtime.sendMessage({ type: "error", errorMessage, severity });
  } catch (err) {
    log("Failed sending error message to front-end: ", err);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// AUTENTICAÇÃO E TOKENS DO FACEBOOK
// ─────────────────────────────────────────────────────────────

/**
 * Acessa facebook.com/settings e extrai o token fb_dtsg (CSRF).
 * @returns {{ loggedin: boolean, fb_dtsg?: string }}
 */
async function fetchFbDtsgToken() {
  let token = "";
  try {
    const html = await fetchFacebookSettingsHtmlViaTab();
    const match = html.match(
      /"DTSGInitialData",\s*\[[^\]]*\],\s*\{[^{}]*"token"\s*:\s*"([^"]+)"[^{}]*\}/,
    );

    if (match && match[1]) {
      token = match[1];
    } else {
      log("Error fetching FB_DSTG");
      return { loggedin: false };
    }
  } catch (err) {
    log("Error fetching data:", err);
    return { loggedin: false };
  }
  return { fb_dtsg: token, loggedin: true };
}

/**
 * Acessa facebook.com/settings e extrai o actorID (ID do usuário logado).
 * @returns {{ loggedIn: boolean, userId?: string }}
 */
async function fetchCurrentUserId() {
  try {
    const html = await fetchFacebookSettingsHtmlViaTab();
    const match = html.match(/"actorID":\s*"(\d+)"/) || html.match(/"actorId":\s*"(\d+)"/);

    if (match && match[1]) return { loggedIn: true, userId: match[1] };

    log("Error fetching actorID");
    return { loggedIn: false };
  } catch (err) {
    log("Error fetching data:", err);
    return { loggedIn: false };
  }
}

/**
 * Extrai TODOS os tokens/cookies necessários para chamadas GraphQL.
 * Faz até 3 tentativas com delay de 5s entre elas.
 *
 * @returns {Promise<string[]>} [lsd, actorId, fb_dtsg, rev, hsi, spin_r, spin_b, spin_t]
 */
async function fetchAllAuthTokens() {
  const MAX_RETRIES = 2;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const html = await fetchFacebookSettingsHtmlViaTab();

      const lsd = html.match(/"token":\s*"([^"]+)"/)?.[1] ?? null;
      const userId = html.match(/"actorId":\s*"([^"]+)"/)?.[1] ?? null;
      const dtsg =
        html.match(
          /"DTSGInitialData",\s*\[[^\]]*\],\s*\{[^{}]*"token"\s*:\s*"([^"]+)"[^{}]*\}/,
        )?.[1] ?? null;
      const rev = html.match(/"consistency":\s*{"rev":\s*(\d+)}/)?.[1] ?? null;
      const hsi = html.match(/"hsi":\s*"([^"]+)"/)?.[1] ?? null;
      const spinR = html.match(/"__spin_r":\s*(\d+),/)?.[1] ?? null;
      const spinB = html.match(/"__spin_b":\s*"([^"]+)"/)?.[1] ?? null;
      const spinT = html.match(/"__spin_t":\s*(\d+),/)?.[1] ?? null;

      if (lsd && userId && dtsg && rev && hsi && spinR && spinB && spinT) {
        return [lsd, userId, dtsg, rev, hsi, spinR, spinB, spinT];
      }

      const preview = html.slice(0, 160).replace(/\s+/g, " ");
      throw new Error(
        `Failed to extract all required cookies. /settings preview: ${preview}`,
      );
    } catch (err) {
      attempt++;
      log(
        `Error getting cookies (attempt ${attempt}/${MAX_RETRIES + 1}):`,
        err,
      );
      if (attempt <= MAX_RETRIES) {
        log("Retrying in 5 seconds...");
        await sleep(5000);
      } else {
        log("Max retries reached for fetchAllAuthTokens");
        return [];
      }
    }
  }
}

/**
 * Obtém o token fb_dtsg ou envia erro ao front-end se não estiver logado.
 * @returns {Promise<string>}
 */
async function getAuthToken() {
  const result = await fetchFbDtsgToken();
  if (result.loggedin) {
    if (result.fb_dtsg) return result.fb_dtsg;
  } else {
    sendErrorToFrontend(
      "Not logged in. Please log in to Facebook and try again.",
      "STOP",
    );
  }
  return "";
}

const FACEBOOK_URL_PATTERNS = [
  "https://www.facebook.com/*",
  "https://web.facebook.com/*",
];

async function fetchViaFacebookTabForGroups(url, options = {}) {
  const tabs = await chrome.tabs.query({ url: FACEBOOK_URL_PATTERNS });
  if (!tabs.length) {
    throw new Error(
      "Nenhuma aba do Facebook aberta. Abra facebook.com e tente novamente.",
    );
  }

  const tab = tabs.find((t) => t.active) || tabs[0];
  if (typeof tab.id !== "number") {
    throw new Error("Aba do Facebook inválida.");
  }
  const tabUrl = tab.url || "";
  const tabOrigin = tabUrl ? new URL(tabUrl).origin : "https://www.facebook.com";
  const requestUrl = url.startsWith("/") ? `${tabOrigin}${url}` : url;

  const execResults = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    world: "MAIN",
    func: async (requestUrl, requestMethod, requestHeaders, requestBody) => {
      try {
        const response = await fetch(requestUrl, {
          method: requestMethod,
          headers: requestHeaders,
          ...(requestMethod !== "GET" ? { body: requestBody } : {}),
          credentials: "include",
        });
        const text = await response.text();
        return { ok: response.ok, status: response.status, text };
      } catch (error) {
        return {
          ok: false,
          status: 0,
          error: error?.message || "Failed to fetch",
        };
      }
    },
    args: [
      requestUrl,
      options.method || "POST",
      options.headers || {},
      options.body || "",
    ],
  });

  const result = execResults?.[0]?.result;
  if (!result) {
    throw new Error("Sem resposta da aba do Facebook para buscar grupos.");
  }
  return result;
}

let isGroupsFetchRunning = false;
let shouldStopGroupsFetch = false;

async function fetchFacebookSettingsHtmlViaTab() {
  const response = await fetchViaFacebookTabForGroups("/settings", {
    method: "GET",
    headers: {
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  const html = String(response?.text || "");
  if (!response?.ok) {
    const preview = html.slice(0, 160).replace(/\s+/g, " ");
    throw new Error(
      `Falha ao buscar /settings (HTTP ${response?.status || 0}). Preview: ${preview || "empty"}`,
    );
  }

  return html;
}

// ─────────────────────────────────────────────────────────────
// GRUPOS DO FACEBOOK
// ─────────────────────────────────────────────────────────────

/**
 * Busca grupos do usuário via GraphQL do Facebook.
 * Faz paginação automática usando end_cursor.
 *
 * @param {string} cursor   - Cursor de paginação (vazio para primeira página)
 * @param {string} fbDtsg   - Token CSRF fb_dtsg
 * @returns {Promise<object[]|{ noGroups: boolean, groups: [] }>}
 */

async function fetchFacebookGroups(
  cursor,
  fbDtsg,
  runningCount = 0,
  emitChunks = false,
) {
  if (shouldStopGroupsFetch) return [];

  // ⚠️ doc_id é um identificador interno do Facebook que pode mudar.
  // Se a função parar de funcionar, capture o payload real no DevTools:
  //   Network → filtrar "graphql" → procurar GroupsCometPinnedGroupsDialogQuery → copiar doc_id
  const DOC_ID_FIRST_PAGE = "7740459739385247"; // GroupsCometPinnedGroupsDialogQuery
  const DOC_ID_PAGINATION = "7218669964900608"; // GroupsCometUnpinnedGroupsPaginationListPaginatedQuery

  // O header x-fb-lsd NÃO deve ser enviado nessa requisição.
  // O código original não o incluía e funcionava corretamente.
  // Adicionar origin ou x-fb-lsd faz o Facebook retornar body vazio (content-length: 0).
  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    "x-fb-friendly-name": "GroupsCometAllJoinedGroupsSectionPaginationQuery",
  };

  let body;
  if (cursor) {
    // Paginação — busca grupos não fixados com cursor
    const vars = `variables=%7B%22count%22%3A10%2C%22cursor%22%3A%22${cursor}%22%2C%22ordering%22%3A%5B%22viewer_added%22%5D%2C%22scale%22%3A1%7D`;
    body = `fb_dtsg=${fbDtsg}&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=GroupsCometUnpinnedGroupsPaginationListPaginatedQuery&${vars}&server_timestamps=true&doc_id=${DOC_ID_PAGINATION}`;
  } else {
    // Primeira página — busca grupos fixados
    const vars = `variables=%7B%22ordering%22%3A%5B%22viewer_added%22%5D%2C%22scale%22%3A1%7D`;
    body = `fb_dtsg=${fbDtsg}&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=GroupsCometPinnedGroupsDialogQuery&${vars}&server_timestamps=true&doc_id=${DOC_ID_FIRST_PAGE}`;
  }

  try {
    // Esta chamada precisa partir do contexto de uma aba facebook.com
    // para evitar bloqueio por origem chrome-extension://.
    const response = await fetchViaFacebookTabForGroups(
      "/api/graphql/",
      { headers, body },
    );
    if (!response.ok) {
      throw new Error(response.error || "Falha ao buscar grupos no Facebook.");
    }
    const rawText = (response.text || "").replace(/^for\s*\(;;\);\s*/, "");
    const json = JSON.parse(rawText);
    const groupsTab = json?.data?.viewer?.groups_tab;

    if (!groupsTab) throw new Error("Invalid response format");

    const hasPinned = groupsTab.pinned_groups?.edges?.length > 0;
    const hasUnpinned = groupsTab.tab_groups_list?.edges?.length > 0;
    const isEmpty = !hasPinned && !hasUnpinned && !cursor;

    /**
     * Mapeia um edge de grupo para objeto simplificado.
     */
    const mapGroup = (edge) => ({
      id: edge.node.id,
      name: edge.node.name,
      image: edge.node.profile_picture.uri,
      privacy: edge.node.privacy_info.title.text,
      members: edge.node.group_member_profiles.formatted_count_text,
    });

    let groups = [];

    // Adiciona grupos fixados (apenas na primeira página)
    if (!cursor && groupsTab.pinned_groups?.edges) {
      groups = groupsTab.pinned_groups.edges.map(mapGroup);
    }

    // Adiciona grupos não fixados
    if (groupsTab.tab_groups_list?.edges) {
      const unpinned = groupsTab.tab_groups_list.edges.map(mapGroup);
      groups = groups.concat(unpinned);

      const accumulatedCount = runningCount + groups.length;
      if (emitChunks) {
        chrome.runtime.sendMessage({
          type: "groupsChunk",
          groups,
          count: accumulatedCount,
        });
      }
      chrome.runtime.sendMessage({
        type: "groupsFetched",
        count: accumulatedCount,
      });

      const pageInfo = groupsTab.tab_groups_list.page_info;
      if (pageInfo.has_next_page && pageInfo.end_cursor && !shouldStopGroupsFetch) {
        await sleep(1000);
        if (shouldStopGroupsFetch) return groups;
        const nextPage = await fetchFacebookGroups(
          pageInfo.end_cursor,
          fbDtsg,
          accumulatedCount,
          emitChunks,
        );
        if (Array.isArray(nextPage)) groups = groups.concat(nextPage);
        else if (nextPage?.groups) groups = groups.concat(nextPage.groups);
      }
    }

    if (isEmpty && groups.length === 0 && !cursor) {
      return { noGroups: true, groups: [] };
    }

    return groups;
  } catch (err) {
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────
// DATA DE CRIAÇÃO DO PERFIL
// ─────────────────────────────────────────────────────────────

/**
 * Busca a data de criação do perfil do usuário logado via GraphQL.
 * @returns {Promise<{ creationDate: string }>}
 */
async function fetchProfileCreationDate() {
  try {
    const tokens = await fetchAllAuthTokens();
    const [lsd, userId, fbDtsg, rev, hsi, spinR, spinB, spinT] = tokens;

    if (!lsd || !userId || !fbDtsg) {
      log(
        "getCreationDate: missing required cookies, skipping account age detection.",
      );
      return { creationDate: "" };
    }

    const headers = {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded",
      origin: "https://www.facebook.com",
      referer: "https://www.facebook.com/",
      "x-asbd-id": "359341",
      "x-fb-friendly-name": "ProfileCometDirectoryAuthenticityModalQuery",
      "x-fb-lsd": lsd || "",
    };

    const variables = { scale: 2, userID: userId };
    const body =
      `av=${userId}` +
      `&__aaid=0&__user=${userId}&__a=1&__req=1m&__hs=19873.HYP:comet_pkg.2.1..2.1&dpr=1&__ccg=EXCELLENT` +
      `&__rev=${rev}&__s=nosession&__hsi=${hsi}&__dyn=&__csr=&__comet_req=15` +
      `&fb_dtsg=${encodeURIComponent(fbDtsg)}&jazoest=25454&lsd=${encodeURIComponent(lsd)}` +
      `&__spin_r=${spinR}&__spin_b=${encodeURIComponent(spinB)}&__spin_t=${spinT}` +
      `&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=ProfileCometDirectoryAuthenticityModalQuery` +
      `&variables=${encodeURIComponent(JSON.stringify(variables))}&server_timestamps=true&doc_id=25692243083796369`;

    const response = await fetch("https://www.facebook.com/api/graphql/", {
      method: "POST",
      headers,
      body,
    });
    if (!response.ok) {
      log("getCreationDate: non-OK response from GraphQL.");
      return { creationDate: "" };
    }

    const text = await response.text();
    const match = text.match(/"PROFILE_JOIN_DATE","value":"([^"]+)"/);
    if (!match) {
      log("getCreationDate: PROFILE_JOIN_DATE not found in response.");
      return { creationDate: "" };
    }

    const creationDate = match[1].replace(/\s+/g, " ").trim();
    if (!creationDate) return { creationDate: "" };

    return { creationDate };
  } catch (err) {
    log("getCreationDate: error fetching join date:", err);
    return { creationDate: "" };
  }
}

// ─────────────────────────────────────────────────────────────
// FEED DE POSTS DOS GRUPOS
// ─────────────────────────────────────────────────────────────

// Estado global do feed (reset a cada nova busca)
let isFirstRun = true;
let cutoffTimestamp = 0;
let isMonitorRunning = false;
let isMonitorCycleRunning = false;
let monitorWarmupDone = false;
const LEADS_HISTORY_STORAGE_KEY = "leadsHistory";
const LEADS_HISTORY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MONITOR_CYCLE_TIMEOUT_MS = 180000;
const MONITOR_ALARM_NAME = "post-monitor-cycle";
const SLEEP_SCHEDULE_ALARM_NAME = "sleep-schedule-check";
const MONITOR_RUNTIME_STORAGE_KEY = "postMonitorRuntime";
const SLEEP_SCHEDULE_STORAGE_KEY = "sleepSchedule";
const NOTIFICATION_SETTINGS_STORAGE_KEY = "notificationSettingsGlobal";
const NOTIFICATION_CLICK_MAP_KEY = "notificationClickMap";
const NOTIFICATION_INBOX_STORAGE_KEY = "notificationInbox";
const NOTIFICATION_COUNTERS_STORAGE_KEY = "notificationCounters";
const NOTIFICATION_CLICK_MAX_ITEMS = 50;
const NOTIFICATION_CLICK_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NOTIFICATION_INBOX_MAX_ITEMS = 200;
const NOTIFICATION_INBOX_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MONITOR_CONNECTION_NOTIFICATION_COOLDOWN_MS = 15 * 60 * 1000;
const TELEGRAM_EDGE_URL =
  "https://hfnwpzglvbzkvhrcwmet.supabase.co/functions/v1/telegram-notify";
let monitorConfig = {
  selectedGroupIds: [],
  positiveKeywords: [],
  negativeKeywords: [],
  profileName: "",
  minMinutes: 3,
  maxMinutes: 7,
};
let monitorConnectionIssue = null;
let isSleepModeActive = false;
let wasRunningBeforeSleep = false;

function getDefaultNotificationSettings() {
  return {
    notifyBrowser: true,
    notifyWebhook: false,
    notifyTelegram: false,
    webhookUrl: "",
    telegramChatId: "",
  };
}

async function getStoredLanguage() {
  const data = await chrome.storage.local.get(["language"]);
  const value = String(data?.language || "").toLowerCase();
  if (["pt-br", "es", "fr"].includes(value)) return value;
  return "en";
}

const BACKGROUND_I18N = {
  en: {
    "notify.fb_tab_missing_title": "GrabClientsNow: Facebook tab missing",
    "notify.fb_tab_missing_body":
      "Monitoring needs a facebook.com tab open in this browser. Reopen Facebook to keep monitoring working.",
    "notify.fb_login_required_title": "GrabClientsNow: Facebook login required",
    "notify.fb_login_required_body":
      "Your Facebook session looks disconnected. Log in again and keep a facebook.com tab open.",
  },
  "pt-br": {
    "notify.fb_tab_missing_title": "GrabClientsNow: aba do Facebook fechada",
    "notify.fb_tab_missing_body":
      "O monitoramento precisa de uma aba do facebook.com aberta neste navegador. Reabra o Facebook para continuar.",
    "notify.fb_login_required_title":
      "GrabClientsNow: login do Facebook necessário",
    "notify.fb_login_required_body":
      "Sua sessão do Facebook parece desconectada. Faça login novamente e mantenha uma aba do facebook.com aberta.",
  },
  es: {
    "notify.fb_tab_missing_title":
      "GrabClientsNow: falta la pestaña de Facebook",
    "notify.fb_tab_missing_body":
      "El monitoreo necesita una pestaña de facebook.com abierta en este navegador. Vuelve a abrir Facebook para continuar.",
    "notify.fb_login_required_title":
      "GrabClientsNow: se requiere inicio de sesión en Facebook",
    "notify.fb_login_required_body":
      "Tu sesión de Facebook parece desconectada. Inicia sesión de nuevo y mantén una pestaña de facebook.com abierta.",
  },
  fr: {
    "notify.fb_tab_missing_title":
      "GrabClientsNow : onglet Facebook introuvable",
    "notify.fb_tab_missing_body":
      "Le monitoring nécessite un onglet facebook.com ouvert dans ce navigateur. Rouvrez Facebook pour continuer.",
    "notify.fb_login_required_title":
      "GrabClientsNow : connexion Facebook requise",
    "notify.fb_login_required_body":
      "Votre session Facebook semble déconnectée. Reconnectez-vous et gardez un onglet facebook.com ouvert.",
  },
};

async function bgTranslate(key) {
  const locale = await getStoredLanguage();
  return (
    BACKGROUND_I18N[locale]?.[key] ||
    BACKGROUND_I18N.en[key] ||
    key
  );
}

async function loadNotificationSettings() {
  const data = await chrome.storage.local.get([NOTIFICATION_SETTINGS_STORAGE_KEY]);
  const raw = data?.[NOTIFICATION_SETTINGS_STORAGE_KEY];
  if (!raw || typeof raw !== "object") return getDefaultNotificationSettings();
  return { ...getDefaultNotificationSettings(), ...raw };
}

function buildNotificationInboxId() {
  return `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function resolveActionStatusMeta() {
  if (isSleepModeActive) {
    return { label: "Sleep mode", color: "#f59e0b" };
  }
  if (isMonitorRunning) {
    return { label: "Monitoring ON", color: "#16a34a" };
  }
  return { label: "Monitoring OFF", color: "#6b7280" };
}

async function refreshActionUi(counters) {
  if (!chrome.action?.setBadgeText) return;
  const unread = Math.max(0, Number(counters?.unread) || 0);
  const total = Math.max(0, Number(counters?.total) || 0);
  const text = unread > 99 ? "99+" : unread > 0 ? String(unread) : "";
  const status = resolveActionStatusMeta();

  await chrome.action.setBadgeBackgroundColor({ color: status.color });
  await chrome.action.setBadgeText({ text });
  await chrome.action.setTitle({
    title:
      unread > 0
        ? `GrabClientsNow • ${status.label} • ${unread} unread (${total} total)`
        : `GrabClientsNow • ${status.label}`,
  });
}

async function loadNotificationInboxState() {
  const data = await chrome.storage.local.get([
    NOTIFICATION_INBOX_STORAGE_KEY,
    NOTIFICATION_COUNTERS_STORAGE_KEY,
  ]);
  const inbox = pruneNotificationInbox(data?.[NOTIFICATION_INBOX_STORAGE_KEY], {
    ttlMs: NOTIFICATION_INBOX_TTL_MS,
    maxItems: NOTIFICATION_INBOX_MAX_ITEMS,
  });
  const counters = buildNotificationCounters(inbox);

  const storedCounters = data?.[NOTIFICATION_COUNTERS_STORAGE_KEY];
  const needsPersistInbox =
    JSON.stringify(inbox) !==
    JSON.stringify(
      Array.isArray(data?.[NOTIFICATION_INBOX_STORAGE_KEY])
        ? data[NOTIFICATION_INBOX_STORAGE_KEY]
        : [],
    );
  const needsPersistCounters =
    !storedCounters ||
    Number(storedCounters.total || 0) !== counters.total ||
    Number(storedCounters.unread || 0) !== counters.unread;

  if (needsPersistInbox || needsPersistCounters) {
    await chrome.storage.local.set({
      [NOTIFICATION_INBOX_STORAGE_KEY]: inbox,
      [NOTIFICATION_COUNTERS_STORAGE_KEY]: counters,
    });
  }

  return { inbox, counters };
}

async function registerLeadNotificationInboxItem(payload) {
  const { inbox } = await loadNotificationInboxState();
  const id = buildNotificationInboxId();
  const { inbox: nextInbox, counters } = appendNotificationInboxItem(
    inbox,
    {
      id,
      createdAt: Date.now(),
      seenAt: 0,
      leadId: String(payload?.post_url || payload?.detected_at || ""),
      postUrl: String(payload?.post_url || ""),
      source: "lead",
    },
    {
      ttlMs: NOTIFICATION_INBOX_TTL_MS,
      maxItems: NOTIFICATION_INBOX_MAX_ITEMS,
    },
  );

  await chrome.storage.local.set({
    [NOTIFICATION_INBOX_STORAGE_KEY]: nextInbox,
    [NOTIFICATION_COUNTERS_STORAGE_KEY]: counters,
  });
  await refreshActionUi(counters);
  return id;
}

async function registerSystemNotificationInboxItem(payload) {
  const { inbox } = await loadNotificationInboxState();
  const id = buildNotificationInboxId();
  const { inbox: nextInbox, counters } = appendNotificationInboxItem(
    inbox,
    {
      id,
      createdAt: Date.now(),
      seenAt: 0,
      source: "system",
      title: String(payload?.title || "GrabClientsNow"),
      message: String(payload?.message || "").trim(),
      issueKind: String(payload?.issueKind || "").trim(),
      postUrl: String(payload?.url || ""),
    },
    {
      ttlMs: NOTIFICATION_INBOX_TTL_MS,
      maxItems: NOTIFICATION_INBOX_MAX_ITEMS,
    },
  );

  await chrome.storage.local.set({
    [NOTIFICATION_INBOX_STORAGE_KEY]: nextInbox,
    [NOTIFICATION_COUNTERS_STORAGE_KEY]: counters,
  });
  await refreshActionUi(counters);
  return id;
}

async function markNotificationSeenById(notificationId) {
  if (!notificationId) return { updated: false, counters: { total: 0, unread: 0 } };
  const { inbox } = await loadNotificationInboxState();
  let updated = false;
  const now = Date.now();
  const nextInbox = inbox.map((item) => {
    if (String(item?.id || "") !== String(notificationId)) return item;
    if (Number(item?.seenAt || 0)) return item;
    updated = true;
    return { ...item, seenAt: now };
  });
  const counters = buildNotificationCounters(nextInbox);

  if (updated) {
    await chrome.storage.local.set({
      [NOTIFICATION_INBOX_STORAGE_KEY]: nextInbox,
      [NOTIFICATION_COUNTERS_STORAGE_KEY]: counters,
    });
  }
  await refreshActionUi(counters);
  return { updated, counters };
}

async function markAllNotificationsSeen() {
  const { inbox } = await loadNotificationInboxState();
  const now = Date.now();
  let updated = false;
  const nextInbox = inbox.map((item) => {
    if (Number(item?.seenAt || 0)) return item;
    updated = true;
    return { ...item, seenAt: now };
  });
  const counters = buildNotificationCounters(nextInbox);

  if (updated) {
    await chrome.storage.local.set({
      [NOTIFICATION_INBOX_STORAGE_KEY]: nextInbox,
      [NOTIFICATION_COUNTERS_STORAGE_KEY]: counters,
    });
  }
  await refreshActionUi(counters);
  return { updated, counters };
}

async function clearNotificationInboxState() {
  const counters = { total: 0, unread: 0 };
  await chrome.storage.local.set({
    [NOTIFICATION_INBOX_STORAGE_KEY]: [],
    [NOTIFICATION_COUNTERS_STORAGE_KEY]: counters,
    [NOTIFICATION_CLICK_MAP_KEY]: {},
  });
  await refreshActionUi(counters);
}

async function postJsonWithTimeout(url, payload, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const text = await response.text();
    return { ok: response.ok, status: response.status, text };
  } finally {
    clearTimeout(timer);
  }
}

async function sendDesktopLeadNotification(payload, notificationId = "") {
  if (!chrome.notifications?.create) {
    return { ok: false, error: "notifications API unavailable" };
  }
  const id =
    notificationId || `lead-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const message =
    `${payload?.lead_name || "Lead"} in ${payload?.group || "group"}\n` +
    `${String(payload?.post_text || "").slice(0, 120)}`;
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "assets/icon.png",
    title: "GrabClientsNow",
    message,
    priority: 2,
  });
  await storeNotificationClickTarget(id, payload?.post_url || "");
  return { ok: true };
}

async function sendDesktopSystemNotification(payload, notificationId = "") {
  if (!chrome.notifications?.create) {
    return { ok: false, error: "notifications API unavailable" };
  }
  const id =
    notificationId || `system-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await chrome.notifications.create(id, {
    type: "basic",
    iconUrl: "assets/icon.png",
    title: String(payload?.title || "GrabClientsNow"),
    message: String(payload?.message || "").slice(0, 220),
    priority: 2,
  });
  await storeNotificationClickTarget(
    id,
    payload?.url || chrome.runtime.getURL("index.html"),
  );
  return { ok: true };
}

async function classifyMonitorConnectionIssue(errorMessage) {
  const kind = classifyMonitorIssueKind(errorMessage);
  if (kind === "fb_tab_missing") {
    return {
      kind,
      title: await bgTranslate("notify.fb_tab_missing_title"),
      message: await bgTranslate("notify.fb_tab_missing_body"),
    };
  }

  if (kind === "fb_login_required") {
    return {
      kind,
      title: await bgTranslate("notify.fb_login_required_title"),
      message: await bgTranslate("notify.fb_login_required_body"),
    };
  }

  return null;
}

async function notifyMonitorConnectionIssue(issue) {
  if (!issue?.kind) return false;
  const runtime = await loadMonitorRuntime();
  const previous = runtime.connectionIssue || null;
  const shouldNotify = shouldNotifyMonitorIssue(
    previous,
    issue.kind,
    Date.now(),
    MONITOR_CONNECTION_NOTIFICATION_COOLDOWN_MS,
  );

  if (!shouldNotify) return false;

  const inboxId = await registerSystemNotificationInboxItem({
    title: issue.title,
    message: issue.message,
    issueKind: issue.kind,
    url: chrome.runtime.getURL("index.html"),
  });
  await sendDesktopSystemNotification(
    {
      title: issue.title,
      message: issue.message,
      url: chrome.runtime.getURL("index.html"),
    },
    inboxId,
  );
  return true;
}

async function storeNotificationClickTarget(notificationId, url) {
  if (!notificationId || !url) return;
  const data = await chrome.storage.local.get([NOTIFICATION_CLICK_MAP_KEY]);
  const map = upsertNotificationClickTarget(
    data?.[NOTIFICATION_CLICK_MAP_KEY],
    notificationId,
    url,
    {
      ttlMs: NOTIFICATION_CLICK_TTL_MS,
      maxItems: NOTIFICATION_CLICK_MAX_ITEMS,
    },
  );
  await chrome.storage.local.set({ [NOTIFICATION_CLICK_MAP_KEY]: map });
}

async function consumeNotificationClickTarget(notificationId) {
  if (!notificationId) return "";
  const data = await chrome.storage.local.get([NOTIFICATION_CLICK_MAP_KEY]);
  const { url, map } = consumeClickTargetEntry(
    data?.[NOTIFICATION_CLICK_MAP_KEY],
    notificationId,
    {
      ttlMs: NOTIFICATION_CLICK_TTL_MS,
      maxItems: NOTIFICATION_CLICK_MAX_ITEMS,
    },
  );
  await chrome.storage.local.set({ [NOTIFICATION_CLICK_MAP_KEY]: map });
  return url;
}

async function sendWebhookLeadNotification(webhookUrl, payload) {
  if (!webhookUrl) return { ok: false, error: "missing webhook url" };
  try {
    const res = await postJsonWithTimeout(webhookUrl, payload, 10000);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "request failed" };
  }
}

async function sendTelegramLeadNotification(chatId, payload) {
  if (!TELEGRAM_EDGE_URL || TELEGRAM_EDGE_URL.includes("YOUR_PROJECT")) {
    return { ok: false, error: "telegram edge url not configured" };
  }
  if (!chatId) return { ok: false, error: "missing chat_id" };
  try {
    const res = await postJsonWithTimeout(
      TELEGRAM_EDGE_URL,
      { chat_id: chatId, ...payload },
      10000,
    );
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err?.message || "request failed" };
  }
}

function buildLeadNotificationPayload(post, profileName) {
  return {
    alert_name: profileName || "",
    lead_name: post?.poster_name || "",
    group: post?.group_name || "",
    post_text: String(post?.post_text || post?.marketplace_text || "")
      .replace(/\s+/g, " ")
      .trim(),
    post_url: post?.post_url || post?.marketplace_listing_url || "",
    matched_keywords: [],
    detected_at: new Date().toISOString(),
  };
}

async function dispatchLeadNotifications(matches, profileName) {
  if (!Array.isArray(matches) || matches.length === 0) return;
  const settings = await loadNotificationSettings();
  const payload = buildLeadNotificationPayload(matches[0], profileName);
  const hasAnyEnabledChannel =
    !!settings.notifyBrowser ||
    !!(settings.notifyWebhook && settings.webhookUrl) ||
    !!(settings.notifyTelegram && settings.telegramChatId);
  if (!hasAnyEnabledChannel) return;

  const inboxId = await registerLeadNotificationInboxItem(payload);

  if (settings.notifyBrowser) {
    const result = await sendDesktopLeadNotification(payload, inboxId);
    if (!result.ok) log("[NOTIFY] Desktop failed:", result.error);
  }
  if (settings.notifyWebhook && settings.webhookUrl) {
    const result = await sendWebhookLeadNotification(settings.webhookUrl, payload);
    if (!result.ok) log("[NOTIFY] Webhook failed:", result.error);
  }
  if (settings.notifyTelegram && settings.telegramChatId) {
    const result = await sendTelegramLeadNotification(settings.telegramChatId, payload);
    if (!result.ok) log("[NOTIFY] Telegram failed:", result.error);
  }
}

async function loadSleepSchedule() {
  const data = await chrome.storage.local.get([SLEEP_SCHEDULE_STORAGE_KEY]);
  const raw = data?.[SLEEP_SCHEDULE_STORAGE_KEY];
  if (!raw || typeof raw !== "object") {
    const fallback = getDefaultSleepSchedule();
    await chrome.storage.local.set({ [SLEEP_SCHEDULE_STORAGE_KEY]: fallback });
    return fallback;
  }
  const normalized = normalizeSleepSchedule(raw);
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await chrome.storage.local.set({ [SLEEP_SCHEDULE_STORAGE_KEY]: normalized });
  }
  return normalized;
}

function ensureSleepScheduleAlarm() {
  chrome.alarms.create(SLEEP_SCHEDULE_ALARM_NAME, { periodInMinutes: 1 });
}

async function saveMonitorRuntime() {
  await chrome.storage.local.set({
    [MONITOR_RUNTIME_STORAGE_KEY]: {
      running: isMonitorRunning,
      warmupDone: monitorWarmupDone,
      config: monitorConfig,
      sleepModeActive: isSleepModeActive,
      wasRunningBeforeSleep,
      connectionIssue: monitorConnectionIssue,
    },
  });
}

async function loadMonitorRuntime() {
  const data = await chrome.storage.local.get([MONITOR_RUNTIME_STORAGE_KEY]);
  const runtime = data?.[MONITOR_RUNTIME_STORAGE_KEY];
  if (!runtime || typeof runtime !== "object") {
    return { running: false, warmupDone: false, config: null };
  }
  return {
    running: !!runtime.running,
    warmupDone: !!runtime.warmupDone,
    config: runtime.config || null,
    sleepModeActive: !!runtime.sleepModeActive,
    wasRunningBeforeSleep: !!runtime.wasRunningBeforeSleep,
    connectionIssue:
      runtime.connectionIssue && typeof runtime.connectionIssue === "object"
        ? runtime.connectionIssue
        : null,
  };
}

function scheduleNextMonitorAlarm(delayMs) {
  const delayInMinutes = Math.max(0.1, delayMs / 60000);
  chrome.alarms.create(MONITOR_ALARM_NAME, { delayInMinutes });
}

async function saveLeadsToHistory(matches, profileName) {
  const data = await chrome.storage.local.get([LEADS_HISTORY_STORAGE_KEY]);
  const pruned = mergeLeadHistory(
    data?.[LEADS_HISTORY_STORAGE_KEY],
    matches,
    profileName,
    { ttlMs: LEADS_HISTORY_TTL_MS },
  );
  await chrome.storage.local.set({ [LEADS_HISTORY_STORAGE_KEY]: pruned });
}

async function getLeadsHistory() {
  const data = await chrome.storage.local.get([LEADS_HISTORY_STORAGE_KEY]);
  const history = pruneLeadsHistory(data?.[LEADS_HISTORY_STORAGE_KEY], {
    ttlMs: LEADS_HISTORY_TTL_MS,
  });
  await chrome.storage.local.set({ [LEADS_HISTORY_STORAGE_KEY]: history });
  return history;
}

function normalizeKeywordList(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((v) => String(v || "").trim().toLowerCase())
    .filter(Boolean);
}

function postMatchesKeywordConfig(post, config) {
  const text = `${post?.post_text || ""} ${post?.marketplace_text || ""}`
    .toLowerCase()
    .trim();

  if (!text) return false;

  if (config.selectedGroupIds?.length > 0) {
    const gid = String(post?.group_id || "");
    if (!config.selectedGroupIds.includes(gid)) return false;
  }

  const hasPositive =
    config.positiveKeywords.length === 0 ||
    config.positiveKeywords.some((kw) => text.includes(kw));
  if (!hasPositive) return false;

  const hasNegative = config.negativeKeywords.some((kw) => text.includes(kw));
  return !hasNegative;
}

function getRandomMonitorDelayMs(minMinutes, maxMinutes) {
  const min = Math.max(1, Number(minMinutes) || 3);
  const max = Math.max(min, Number(maxMinutes) || 7);
  const randomMinutes = min + Math.random() * (max - min);
  return Math.floor(randomMinutes * 60 * 1000);
}

async function stopPostMonitor(notifyUi = true) {
  isMonitorRunning = false;
  isMonitorCycleRunning = false;
  wasRunningBeforeSleep = false;
  monitorConnectionIssue = null;
  chrome.alarms.clear(MONITOR_ALARM_NAME);
  await saveMonitorRuntime();
  const { counters } = await loadNotificationInboxState();
  await refreshActionUi(counters);

  if (notifyUi) {
    chrome.runtime.sendMessage({
      type: "monitorState",
      running: false,
    });
  }
}

async function applySleepModeTransition() {
  const schedule = await loadSleepSchedule();
  const transition = getSleepModeTransition({
    schedule,
    isSleepModeActive,
    isMonitorRunning,
    wasRunningBeforeSleep,
  });

  if (transition.enteredSleep) {
    isSleepModeActive = transition.nextSleepModeActive;
    isMonitorRunning = transition.nextMonitorRunning;
    wasRunningBeforeSleep = transition.nextWasRunningBeforeSleep;
    if (transition.pauseMonitor) {
      chrome.alarms.clear(MONITOR_ALARM_NAME);
      chrome.runtime.sendMessage({
        type: "monitorSleep",
        active: true,
        message: "Sleep mode active — monitoring paused.",
      });
      chrome.runtime.sendMessage({
        type: "monitorState",
        running: false,
      });
    } else {
      chrome.runtime.sendMessage({
        type: "monitorSleep",
        active: true,
        message: "Sleep mode active.",
      });
    }
    await saveMonitorRuntime();
    const { counters } = await loadNotificationInboxState();
    await refreshActionUi(counters);
    return;
  }

  if (transition.exitedSleep) {
    isSleepModeActive = transition.nextSleepModeActive;
    isMonitorRunning = transition.nextMonitorRunning;
    wasRunningBeforeSleep = transition.nextWasRunningBeforeSleep;
    chrome.runtime.sendMessage({
      type: "monitorSleep",
      active: false,
      message: "Sleep mode ended.",
    });

    if (transition.resumeMonitor) {
      await saveMonitorRuntime();
      const { counters } = await loadNotificationInboxState();
      await refreshActionUi(counters);
      chrome.runtime.sendMessage({
        type: "monitorState",
        running: true,
      });
      void runPostMonitorCycle();
      return;
    }
    await saveMonitorRuntime();
    const { counters } = await loadNotificationInboxState();
    await refreshActionUi(counters);
  }
}

async function runPostMonitorCycle() {
  if (!isMonitorRunning || isMonitorCycleRunning || isSleepModeActive) return;
  isMonitorCycleRunning = true;

  try {
    chrome.runtime.sendMessage({
      type: "monitorTick",
      running: true,
      profileName: monitorConfig.profileName,
      phase: "start",
      message: "Iniciando ciclo de checagem...",
    });

    const latestPosts = await Promise.race([
      fetchGroupFeedPosts(),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error("Timeout no ciclo de monitor (3 min)."));
        }, MONITOR_CYCLE_TIMEOUT_MS);
      }),
    ]);
    const fetchedPosts = Array.isArray(latestPosts) ? latestPosts : [];
    const selectedIds = Array.isArray(monitorConfig.selectedGroupIds)
      ? monitorConfig.selectedGroupIds
      : [];
    const posts =
      selectedIds.length > 0
        ? fetchedPosts.filter((post) =>
            selectedIds.includes(String(post?.group_id || "")),
          )
        : fetchedPosts;
    const matched = posts.filter((post) =>
      postMatchesKeywordConfig(post, monitorConfig),
    );
    const wasWarmupCycle = !monitorWarmupDone;

    log(
      `[MONITOR] Ciclo concluído: ${posts.length} post(s) em grupos selecionados (total feed: ${fetchedPosts.length}), ${matched.length} match(es).`,
    );
    posts.slice(0, 20).forEach((post, idx) => {
      const content = String(post?.post_text || post?.marketplace_text || "")
        .replace(/\s+/g, " ")
        .trim();
      const postUrl = post?.post_url || post?.marketplace_listing_url || "";
      log(`[MONITOR][POST ${idx + 1}]`);
      log(`  Group: ${post?.group_name || "Group"}`);
      log(`  Person: ${post?.poster_name || "Person"}`);
      log(`  Type: ${post?.post_type || "post"}`);
      log(`  Content: ${content || "(no text)"}`);
      log(`  Group link: ${post?.group_url || "(no link)"}`);
      log(`  Person link: ${post?.user_profile_url || "(no link)"}`);
      log(`  Post link: ${postUrl || "(no link)"}`);
    });

    chrome.runtime.sendMessage({
      type: "monitorRawPosts",
      profileName: monitorConfig.profileName,
      total: posts.length,
      fetchedTotal: fetchedPosts.length,
      posts,
    });

    if (!wasWarmupCycle) {
      if (matched.length > 0) {
        await saveLeadsToHistory(matched, monitorConfig.profileName);
        await dispatchLeadNotifications(matched, monitorConfig.profileName);
        chrome.runtime.sendMessage({
          type: "monitorMatches",
          profileName: monitorConfig.profileName,
          matches: matched,
        });
      }
    } else {
      monitorWarmupDone = true;
    }

    const delayMs = getRandomMonitorDelayMs(
      monitorConfig.minMinutes,
      monitorConfig.maxMinutes,
    );
    if (monitorConnectionIssue) {
      monitorConnectionIssue = null;
    }
    chrome.runtime.sendMessage({
      type: "monitorTick",
      running: true,
      profileName: monitorConfig.profileName,
      polledCount: posts.length,
      matchedCount: wasWarmupCycle ? 0 : matched.length,
      warmup: wasWarmupCycle,
      nextDelayMs: delayMs,
    });
    await saveMonitorRuntime();
    scheduleNextMonitorAlarm(delayMs);
  } catch (err) {
    const errorMessage = await serializeError(err);
    const connectionIssue = await classifyMonitorConnectionIssue(errorMessage);
    const runtime = await loadMonitorRuntime();
    const previousIssue = runtime.connectionIssue || null;
    let notified = false;
    if (connectionIssue) {
      notified = await notifyMonitorConnectionIssue(connectionIssue);
      monitorConnectionIssue = {
        kind: connectionIssue.kind,
        message: errorMessage,
        lastDetectedAt: Date.now(),
        lastNotifiedAt:
          notified
            ? Date.now()
            : Number(previousIssue?.lastNotifiedAt || 0),
      };
    } else {
      monitorConnectionIssue = null;
    }
    await saveMonitorRuntime();
    log(`[MONITOR] Erro no ciclo: ${errorMessage}`);
    chrome.runtime.sendMessage({
      type: "monitorError",
      error: errorMessage,
      issueKind: connectionIssue?.kind || "",
    });

    const retryMs = getRandomMonitorDelayMs(3, 5);
    scheduleNextMonitorAlarm(retryMs);
  } finally {
    isMonitorCycleRunning = false;
  }
}

/**
 * Retorna o maior timestamp (posted_unix) entre os posts.
 */
function getLatestTimestamp(posts) {
  return posts.reduce((max, post) => Math.max(max, post.posted_unix), 0);
}

/**
 * Busca os posts mais recentes do feed de grupos.
 * Faz até 6 páginas de resultados, parando quando achar posts já vistos.
 *
 * @returns {Promise<object[]>} Lista de posts em ordem cronológica reversa
 */
async function fetchGroupFeedPosts() {
  const tokens = await fetchAllAuthTokens();
  const [lsd, userId, fbDtsg, rev, hsi, spinR, spinB, spinT] = tokens;
  if (!lsd || !userId || !fbDtsg || !rev || !hsi || !spinR || !spinB || !spinT) {
    throw new Error(
      "Não foi possível extrair os tokens de autenticação do Facebook. Abra uma aba em facebook.com e tente novamente.",
    );
  }

  const GRAPHQL_URL = "https://www.facebook.com/api/graphql/";
  const DOC_ID = "25164462503148437";
  const MAX_PAGES = 6;

  const headers = {
    accept: "*/*",
    "accept-language": "en-US,en;q=0.9",
    "content-type": "application/x-www-form-urlencoded",
    origin: "https://www.facebook.com",
    priority: "u=1, i",
    referer: "https://www.facebook.com/?filter=groups&sk=h_chr",
    "sec-ch-ua": '"Brave";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "sec-gpc": "1",
    "x-asbd-id": "129477",
    "x-fb-friendly-name": "CometNewsFeedPaginationQuery",
    "x-fb-lsd": lsd || "",
  };

  /**
   * Gera o corpo da requisição GraphQL para o feed.
   * @param {string} cursor - Cursor de paginação (vazio para 1ª página)
   */
  function buildFeedRequestBody(cursor) {
    const clientQueryId =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    const vpvToken =
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15);
    const payloads = Array.from({ length: 6 }, () =>
      Math.random().toString(36).substring(2, 15),
    ).join("");
    const originalQid = Math.floor(1e18 * Math.random());
    const qid = Math.floor(1e18 * Math.random());
    const vsid = Math.floor(1e18 * Math.random());

    const recentVPVs = JSON.stringify([
      {
        client_vpv_token: vpvToken,
        evt: "vpv",
        feed_backend_data_serialized_payloads: payloads,
        fetch_tracking: false,
        original_qid: originalQid.toString(),
        qid: qid.toString(),
        timestamp: Date.now(),
        vsid: vsid.toString(),
        vspos: 27,
      },
    ]);

    const variables = {
      RELAY_INCREMENTAL_DELIVERY: true,
      clientQueryId,
      clientSession: null,
      connectionClass: "EXCELLENT",
      count: 5,
      ...(cursor ? { cursor } : {}),
      experimentalValues: null,
      feedLocation: "NEWSFEED",
      feedStyle: "MOST_RECENT_GROUPS_FEED",
      feedbackSource: 1,
      focusCommentID: null,
      orderby: ["MOST_RECENT"],
      privacySelectorRenderLocation: "COMET_STREAM",
      recentVPVs: JSON.parse(recentVPVs),
      refreshMode: "COLD_START",
      renderLocation: "homepage_stream",
      scale: 2,
      shouldChangeBRSLabelFieldName: true,
      shouldChangeSponsoredAuctionDistanceFieldName: false,
      shouldChangeSponsoredDataFieldName: true,
      shouldObfuscateCategoryField: true,
      shouldUseBRSLabelFieldNameV1: false,
      shouldUseBRSLabelFieldNameV2: true,
      shouldUseSponsoredAuctionLabelFieldNameV1: false,
      shouldUseSponsoredAuctionLabelFieldNameV2: false,
      useDefaultActor: false,
      __relay_internal__pv__GHLShouldChangeSponsoredAuctionDistanceFieldNamerelayprovider: false,
      __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV1relayprovider: false,
      __relay_internal__pv__GHLShouldUseSponsoredAuctionLabelFieldNameV2relayprovider: false,
      __relay_internal__pv__GHLShouldChangeSponsoredDataFieldNamerelayprovider: true,
      __relay_internal__pv__GHLShouldChangeAdIdFieldNamerelayprovider: true,
      __relay_internal__pv__FBReels_enable_view_dubbed_audio_type_gkrelayprovider: false,
      __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
      __relay_internal__pv__IsWorkUserrelayprovider: false,
      __relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider: true,
      __relay_internal__pv__FeedDeepDiveTopicPillThreadViewEnabledrelayprovider: false,
      __relay_internal__pv__CometImmersivePhotoCanUserDisable3DMotionrelayprovider: false,
      __relay_internal__pv__WorkCometIsEmployeeGKProviderrelayprovider: false,
      __relay_internal__pv__IsMergQAPollsrelayprovider: false,
      __relay_internal__pv__FBReels_enable_meta_ai_label_gkrelayprovider: true,
      __relay_internal__pv__FBReelsMediaFooter_comet_enable_reels_ads_gkrelayprovider: true,
      __relay_internal__pv__CometUFIReactionsEnableShortNamerelayprovider: false,
      __relay_internal__pv__CometUFIShareActionMigrationrelayprovider: true,
      __relay_internal__pv__CometUFI_dedicated_comment_routable_dialog_gkrelayprovider: false,
      __relay_internal__pv__StoriesArmadilloReplyEnabledrelayprovider: true,
      __relay_internal__pv__FBReelsIFUTileContent_reelsIFUPlayOnHoverrelayprovider: true,
      __relay_internal__pv__GroupsCometGYSJFeedItemHeightrelayprovider: 150,
      __relay_internal__pv__StoriesShouldIncludeFbNotesrelayprovider: false,
    };

    return (
      `av=${userId}&__aaid=0&__user=${userId}&__a=1&__req=8` +
      `&__hs=19873.HYP:comet_pkg.2.1..2.1&dpr=1&__ccg=EXCELLENT` +
      `&__rev=${rev}&__s=ww8l4e:w5wqeg:i0zg8a&__hsi=${hsi}` +
      `&__dyn=&__csr=&__comet_req=15&fb_dtsg=${fbDtsg}&jazoest=25398&lsd=${lsd}` +
      `&__spin_r=${spinR}&__spin_b=${spinB}&__spin_t=${spinT}` +
      `&fb_api_caller_class=RelayModern&fb_api_req_friendly_name=CometNewsFeedPaginationQuery` +
      `&variables=${JSON.stringify(variables)}&server_timestamps=true&doc_id=${DOC_ID}`
    );
  }

  /**
   * Faz a requisição ao feed com até 3 tentativas.
   * @param {string} body - Corpo da requisição
   * @returns {Promise<{ json: any, cursor: string|null }>}
   */
  function parseFacebookFeedPayload(rawText) {
    const stripped = String(rawText || "")
      .replace(/^for\s*\(;;\);\s*/, "")
      .trim();

    if (!stripped) return null;

    if (stripped.startsWith("<!DOCTYPE") || stripped.startsWith("<html")) {
      throw new Error("Facebook retornou HTML em vez de JSON (sessão/bloqueio).");
    }

    try {
      return JSON.parse(stripped);
    } catch {}

    try {
      const repaired = repairJson(stripped);
      return JSON.parse(repaired);
    } catch {}

    // Fallback: algumas respostas vêm em múltiplas linhas JSON independentes.
    const parsedLines = [];
    for (const line of stripped.split("\n")) {
      const chunk = line.trim();
      if (!chunk) continue;
      if (!chunk.startsWith("{") && !chunk.startsWith("[")) continue;

      try {
        parsedLines.push(JSON.parse(chunk));
        continue;
      } catch {}

      try {
        parsedLines.push(JSON.parse(repairJson(chunk)));
      } catch {}
    }

    if (parsedLines.length > 0) return parsedLines;

    const preview = stripped.slice(0, 120).replace(/\s+/g, " ");
    throw new Error(`Resposta não parseável do feed. Preview: ${preview}`);
  }

  async function fetchFeedPage(body) {
    let retries = 3;

    while (retries > 0) {
      try {
        const response = await fetchViaFacebookTabForGroups("/api/graphql/", {
          headers,
          body,
        });
        const rawText = String(response?.text || "");
        if (!response?.ok) {
          const preview = rawText.slice(0, 140).replace(/\s+/g, " ");
          throw new Error(
            `Feed HTTP ${response?.status || 0}. Preview: ${preview || "empty"}`,
          );
        }

        const cursor = rawText.match('"end_cursor":"([^"]+)"')?.[1] ?? null;
        const parsed = parseFacebookFeedPayload(rawText);
        if (!parsed) return { json: [], cursor };

        // Verifica se o feed retornou edges vazias
        const hasEmptyEdges = checkForEmptyEdges(parsed);
        if (hasEmptyEdges) {
          log("[INFO] No more posts available (empty edges)");
          return { json: [], cursor };
        }

        if (
          rawText.includes("A server error missing_required_variable_value occured")
        ) {
          log("[NOT_AN_ERROR] missing_required_variable_value");
          if (retries === 0) return { json: [], cursor: null };
          log(`Retrying... (${retries}/5)`);
          await sleep(retries === 1 ? 15000 : 5000);
          retries--;
          continue;
        }

        return extractJsonResult(parsed, cursor);
      } catch (err) {
        retries--;
        if (retries === 0) {
          log("Error Fetching feed. after retries:", err);
          throw err;
        }
        log(`Retrying... (${5 - retries}/5)`);
        await sleep(retries < 3 ? 60000 : 30000);
      }
    }

    log("responseJson is empty");
    return { json: [], cursor: null };
  }

  function checkForEmptyEdges(parsed) {
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const edges = item?.data?.viewer?.news_feed?.edges;
        if (edges && Array.isArray(edges) && edges.length === 0) return true;
      }
    } else if (typeof parsed === "object" && parsed !== null) {
      const edges = parsed?.data?.viewer?.news_feed?.edges;
      if (edges && Array.isArray(edges) && edges.length === 0) return true;
    }
    return false;
  }

  function extractJsonResult(parsed, cursor) {
    if (Array.isArray(parsed)) return { json: parsed, cursor };
    if (typeof parsed === "object" && parsed !== null) {
      if (parsed.data && Array.isArray(parsed.data))
        return { json: parsed.data, cursor };
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) return { json: parsed[key], cursor };
      }
    }
    return { json: parsed, cursor };
  }

  // ── Loop de paginação do feed ─────────────────────────────

  let isDone = false;
  let pageNum = 0;
  let nextCursor = "";
  let allPosts = [];

  while (!isDone) {
    if (++pageNum > MAX_PAGES) {
      log("Too many requests, stopping");
      break;
    }

    if (pageNum > 1) {
      await sleep(5000);
    }

    try {
      log(`[FEED] Buscando página ${pageNum}${nextCursor ? " (com cursor)" : " (primeira página)"}...`);
      const body = buildFeedRequestBody(nextCursor);
      const { json, cursor } = await fetchFeedPage(body);

      if (!json || (Array.isArray(json) && json.length === 0)) {
        log("[INFO] No more posts available - response is empty");
        if (isFirstRun) {
          isFirstRun = false;
          cutoffTimestamp = Math.floor(Date.now() / 1000);
        }
        break;
      }

      const pagePosts = extractPostsFromFeedResponse(json);
      log(`[FEED] Página ${pageNum}: ${pagePosts?.length || 0} post(s) extraído(s).`);

      if (!pagePosts || pagePosts.length === 0) {
        log(
          "[INFO] No posts found in processed response - no more posts available",
        );
        if (isFirstRun) {
          isFirstRun = false;
          cutoffTimestamp = Math.floor(Date.now() / 1000);
        }
        break;
      }

      // Processa cada post, parando se já passou do cutoff
      for (const post of pagePosts) {
        if (!post.post_id) continue;
        const postTime =
          typeof post.posted_unix === "number" ? post.posted_unix : 0;

        if (cutoffTimestamp && postTime && postTime <= cutoffTimestamp) {
          isDone = true;
          break;
        }

        if (!allPosts.some((p) => p.post_id === post.post_id)) {
          allPosts.push(post);
        }
      }

      if (cursor) {
        nextCursor = cursor;
      } else {
        log("[INFO] No more pages available (no cursor)");
        break;
      }
    } catch (err) {
      const msg = await serializeError(err);
      sendErrorToFrontend(`Error processing posts. ${msg}`, "STOP");
      return;
    }
  }

  if (isFirstRun) {
    isFirstRun = false;
    cutoffTimestamp =
      allPosts.length > 0
        ? getLatestTimestamp(allPosts)
        : Math.floor(Date.now() / 1000);
  } else if (allPosts.length > 0) {
    cutoffTimestamp = getLatestTimestamp(allPosts);
  }
  return allPosts.reverse();
}

// ─────────────────────────────────────────────────────────────
// PROCESSAMENTO DE POSTS DO FEED
// ─────────────────────────────────────────────────────────────

/**
 * Decodifica strings escapadas do Facebook (unicode, newlines, etc.).
 */
function decodeText(text) {
  if (!text) return text;
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\u([a-fA-F0-9]{4})/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
    .replace(/\u203c\ufe0f/g, "‼️")
    .replace(/\\\//g, "/");
}

/**
 * Remove campos indesejados ("extensions", "children") de objetos aninhados.
 */
function cleanupResponseObject(obj) {
  if (typeof obj !== "object" || obj === null) return obj;
  if (Array.isArray(obj)) return obj.map(cleanupResponseObject);

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key !== "extensions" && key !== "children") {
      cleaned[key] = cleanupResponseObject(value);
    }
  }
  return cleaned;
}

/**
 * Verifica recursivamente se um objeto contém dados de marketplace_listing_seller.
 */
function hasMarketplaceListingSeller(obj) {
  if (typeof obj !== "object" || obj === null) return false;
  if (Array.isArray(obj)) return obj.some(hasMarketplaceListingSeller);
  return (
    "marketplace_listing_seller" in obj ||
    Object.values(obj).some(hasMarketplaceListingSeller)
  );
}

/**
 * Verifica recursivamente se um objeto contém `sponsored_data` com conteúdo.
 */
function findSponsoredData(node) {
  const stack = [node];
  while (stack.length) {
    const current = stack.pop();
    if (current && typeof current === "object") {
      if (Object.prototype.hasOwnProperty.call(current, "sponsored_data")) {
        const data = current.sponsored_data;
        if (
          data != null &&
          (typeof data !== "object" || Object.keys(data).length > 0)
        )
          return data;
      }
      for (const val of Object.values(current)) {
        if (val && typeof val === "object") stack.push(val);
      }
    }
  }
  return null;
}

/**
 * Extrai posts da resposta bruta do feed do Facebook.
 * @param {any} responseData - JSON parseado do feed
 * @returns {object[]}
 */
function extractPostsFromFeedResponse(responseData) {
  const posts = [];

  try {
    // Caso: resposta com viewer.news_feed.edges no primeiro item
    const firstEdges = responseData?.[0]?.data?.viewer?.news_feed?.edges;
    if (firstEdges) {
      for (const edge of firstEdges) {
        const post = parsePostFromEdge({ data: edge });
        if (post) posts.push(post);
      }
    }

    if (Array.isArray(responseData)) {
      for (const item of responseData) {
        if (!item || typeof item !== "object") continue;

        // Caso: item com label específico de paginação do feed
        if (
          item.label ===
          "CometNewsFeed_viewerConnection$stream$CometNewsFeed_viewer_news_feed"
        ) {
          const post = parsePostFromEdge(item);
          if (post) posts.push(post);
          continue;
        }

        // Caso: item com data.viewer.news_feed.edges
        if (item.data?.viewer?.news_feed?.edges) {
          for (const edge of item.data.viewer.news_feed.edges) {
            const post = parsePostFromEdge({ data: edge });
            if (post) posts.push(post);
          }
        }
      }
    } else {
      log("responseJson is not an array, it's:", typeof responseData);
    }
  } catch (err) {
    log("Error processing Facebook response:", err);
  }

  return posts;
}

/**
 * Recebe um edge do feed e retorna um objeto de post normalizado, ou null.
 * Distingue entre post de marketplace e post regular.
 */
function parsePostFromEdge(edgeWrapper) {
  if (!edgeWrapper.data) return null;

  let node = edgeWrapper.data;
  if (node.node) node = node.node;
  else if (!node.post_id) return null;

  node = cleanupResponseObject(node);

  // Descarta posts patrocinados
  if (findSponsoredData(node)) return null;

  // Post de marketplace (repost)
  if (hasMarketplaceListingSeller(node)) return parseMarketplacePost(node);

  // Post regular (com texto ou imagem)
  if (isRegularPost(node)) return parseRegularPost(node);

  return null;
}

/**
 * Verifica se o node é um post regular válido (com texto ou anexo visual).
 */
function isRegularPost(node) {
  if (hasMarketplaceListingSeller(node)) return false;

  const hasText =
    node?.comet_sections?.content?.story?.message?.text ||
    node?.comet_sections?.content?.story?.comet_sections?.message?.story
      ?.message?.text;

  if (hasText) return true;

  const attachments = node?.comet_sections?.content?.story?.attachments;
  if (!attachments || !Array.isArray(attachments)) return true;

  for (const attachment of attachments) {
    const att = attachment.styles?.attachment;
    if (att) {
      if (att.all_subattachments?.nodes?.length > 0) return true;
      const media = att.media;
      if (
        media &&
        (media.photo_image ||
          media.image ||
          media.viewer_image ||
          media.thumbnailImage)
      )
        return true;
    }
    if (
      attachment.media &&
      (attachment.media.photo_image ||
        attachment.media.image ||
        attachment.media.viewer_image)
    )
      return true;
    if (
      attachment.target?.media &&
      (attachment.target.media.photo_image || attachment.target.media.image)
    )
      return true;
  }

  return true;
}

/**
 * Extrai dados de um post de marketplace (produto compartilhado no grupo).
 */
function parseMarketplacePost(node) {
  const post = {
    group_name: "Unknown",
    group_id: "Unknown",
    poster_name: "Unknown",
    post_text: "",
    images: [],
    marketplace_text: "",
    price: "Unknown",
    location: "Unknown",
    post_url: "",
    marketplace_listing_url: "",
    group_url: "",
    user_profile_url: "",
    post_id: "Unknown",
    post_type: "marketplace_repost",
    posted_unix: 0,
  };

  // Grupo
  const groupNode =
    node?.comet_sections?.context_layout?.story?.comet_sections?.title?.story
      ?.to;
  if (groupNode) {
    post.group_name = decodeText(groupNode.name || "Unknown");
    post.group_id = groupNode.id || "Unknown";
    post.group_url = groupNode.url || "";
  } else {
    log("[ERROR] No groupInfoNode found");
  }

  // Timestamp
  const timestampStory =
    node?.comet_sections?.context_layout?.story?.comet_sections?.metadata?.[1]
      ?.story;
  if (timestampStory) {
    post.posted_unix = timestampStory.creation_time;
  } else if (node?.comet_sections?.timestamp) {
    post.posted_unix = node.comet_sections.timestamp;
  } else if (node?.comet_sections?.timestamp?.story?.creation_time) {
    post.posted_unix = node.comet_sections.timestamp.story.creation_time;
  } else {
    log("no TimeStampNode found in marketplace.");
  }

  // Autor
  const actorNode = node?.comet_sections?.content?.story?.actors?.[0];
  if (actorNode) {
    post.poster_name = decodeText(actorNode.name || "Unknown");
    post.user_profile_url = actorNode.url || "";
  } else {
    log("[ERROR] No ActorsNode found");
  }

  // Conteúdo do post
  const contentStory = node?.comet_sections?.content?.story;
  if (contentStory) {
    if (contentStory.message?.text)
      post.post_text = decodeText(contentStory.message.text);
    if (contentStory.wwwURL) post.post_url = contentStory.wwwURL;
    if (contentStory.post_id) post.post_id = contentStory.post_id;
  } else {
    log("[ERROR] No storyNode found");
  }

  // Anexos (imagens, preço, localização)
  const attachments = node?.comet_sections?.content?.story?.attachments;
  if (attachments && Array.isArray(attachments)) {
    for (const attachment of attachments) {
      const att = attachment.styles?.attachment;
      if (!att) continue;

      if (att.url) post.marketplace_listing_url = att.url;

      if (att.all_subattachments?.nodes) {
        for (const subNode of att.all_subattachments.nodes) {
          if (subNode.media?.viewer_image?.uri)
            post.images.push(subNode.media.viewer_image.uri);
        }
      }

      if (att.title_with_entities?.text)
        post.marketplace_text = decodeText(att.title_with_entities.text);

      if (att.target) {
        const target = att.target;
        if (target.id)
          post.marketplace_listing_url = `https://www.facebook.com/commerce/listing/${target.id}/`;
        if (target.formatted_price?.text)
          post.price = decodeText(target.formatted_price.text);
        if (target.location_text?.text)
          post.location = decodeText(target.location_text.text);
      }
    }
  }

  return post;
}

/**
 * Extrai dados de um post regular (texto, imagens, vídeos).
 */
function parseRegularPost(node) {
  const post = {
    group_name: "Unknown",
    group_id: "Unknown",
    poster_name: "Unknown",
    post_text: "",
    images: [],
    videos: [],
    post_url: "",
    group_url: "",
    user_profile_url: "",
    post_id: "Unknown",
    post_type: "regular_post",
    posted_unix: 0,
  };

  // Grupo
  const groupNode =
    node?.comet_sections?.context_layout?.story?.comet_sections?.title?.story
      ?.to;
  if (groupNode) {
    post.group_name = decodeText(groupNode.name || "Unknown");
    post.group_id = groupNode.id || "Unknown";
    post.group_url = groupNode.url || "";
  } else {
    log("[ERROR] No node.to found");
  }

  // Autor
  const actorNode = node?.comet_sections?.content?.story?.actors?.[0];
  if (actorNode) {
    post.poster_name = decodeText(actorNode.name || "Unknown");
    post.user_profile_url = actorNode.url || "";
  } else {
    log("[ERROR] No ActorsNode found");
  }

  // Timestamp
  const timestampStory =
    node?.comet_sections?.context_layout?.story?.comet_sections?.metadata?.[1]
      ?.story;
  if (timestampStory?.creation_time) {
    post.posted_unix = timestampStory.creation_time;
  } else if (node?.comet_sections?.timestamp?.story?.creation_time) {
    post.posted_unix = node.comet_sections.timestamp.story.creation_time;
  } else {
    log("No TimeStampNode found");
  }

  // Conteúdo
  const contentStory = node?.comet_sections?.content?.story;
  if (contentStory) {
    if (contentStory.message?.text)
      post.post_text = decodeText(contentStory.message.text);
    if (contentStory.wwwURL) post.post_url = contentStory.wwwURL;
    if (contentStory.post_id) post.post_id = contentStory.post_id;
  }

  // Anexos (imagens e vídeos)
  const attachments = node?.comet_sections?.content?.story?.attachments;
  if (attachments && Array.isArray(attachments)) {
    for (const attachment of attachments) {
      const att = attachment.styles?.attachment;
      if (!att) continue;

      if (att.all_subattachments?.nodes) {
        for (const subNode of att.all_subattachments.nodes) {
          if (
            subNode.media?.viewer_image?.uri &&
            subNode.media.__typename === "Photo"
          ) {
            post.images.push(subNode.media.viewer_image.uri);
          }
          const videoUrl =
            subNode.media?.video_grid_renderer?.video
              ?.videoDeliveryResponseFragment?.videoDeliveryResponseResult
              ?.progressive_urls?.[0]?.progressive_url;
          if (videoUrl && subNode.media.__typename === "Video") {
            post.videos.push(videoUrl);
          }
        }
      }

      if (att.media?.photo_image?.uri)
        post.images.push(att.media.photo_image.uri);
      if (att.media?.__typename === "Video") {
        const videoUrl =
          att.media.videoDeliveryResponseFragment?.videoDeliveryResponseResult
            ?.progressive_urls?.[0]?.progressive_url;
        if (videoUrl) post.videos.push(videoUrl);
      }
    }
  }

  if (post.videos.length > 0) post.post_type = "video_post";
  return post;
}

// ─────────────────────────────────────────────────────────────
// LISTENERS DE MENSAGENS (comunicação com popup/content scripts)
// ─────────────────────────────────────────────────────────────

function isExtensionPageTab(tab) {
  const url = String(tab?.url || "");
  return url.startsWith(chrome.runtime.getURL(""));
}

async function getExtensionTabs() {
  const allTabs = await chrome.tabs.query({});
  return allTabs.filter(isExtensionPageTab);
}

async function focusTab(tab) {
  if (!tab || typeof tab.id !== "number") return;
  await chrome.tabs.update(tab.id, { active: true });
  if (typeof tab.windowId === "number") {
    await chrome.windows.update(tab.windowId, { focused: true });
  }
}

async function enforceSingleExtensionTab(preferredTabId = null) {
  const extTabs = await getExtensionTabs();
  if (!extTabs.length) return null;

  const keepTab = pickKeepTab(extTabs, preferredTabId);
  if (!keepTab || typeof keepTab.id !== "number") return null;

  const toClose = getTabIdsToClose(extTabs, keepTab.id);

  if (toClose.length) {
    await chrome.tabs.remove(toClose);
  }
  await focusTab(keepTab);
  return keepTab.id;
}

// Abre/foca a página principal da extensão ao clicar no ícone.
chrome.action.onClicked.addListener(async () => {
  const extTabs = await getExtensionTabs();
  if (extTabs.length) {
    const preferred = pickKeepTab(extTabs);
    await enforceSingleExtensionTab(preferred?.id);
    return;
  }
  chrome.tabs.create({ url: "index.html" });
});

// Abre o post ao clicar na notificação desktop.
chrome.notifications?.onClicked?.addListener(async (notificationId) => {
  await markNotificationSeenById(notificationId);
  const url = await consumeNotificationClickTarget(notificationId);
  if (!url) return;
  await chrome.tabs.create({ url });
  try {
    await chrome.notifications.clear(notificationId);
  } catch (_) {
    // ignore
  }
});

// Notifica o front-end sobre atualizações disponíveis
chrome.runtime.onUpdateAvailable.addListener((details) => {
  chrome.runtime.sendMessage({
    type: "updateAvailable",
    version: details.version,
  });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === SLEEP_SCHEDULE_ALARM_NAME) {
    await applySleepModeTransition();
    return;
  }

  if (alarm.name === MONITOR_ALARM_NAME) {
    const runtime = await loadMonitorRuntime();
    if (!runtime.running) {
      isMonitorRunning = false;
      isSleepModeActive = !!runtime.sleepModeActive;
      const { counters } = await loadNotificationInboxState();
      await refreshActionUi(counters);
      return;
    }

    isMonitorRunning = true;
    monitorWarmupDone = runtime.warmupDone;
    isSleepModeActive = !!runtime.sleepModeActive;
    wasRunningBeforeSleep = !!runtime.wasRunningBeforeSleep;
    monitorConnectionIssue = runtime.connectionIssue || null;
    if (runtime.config) monitorConfig = runtime.config;
    const { counters } = await loadNotificationInboxState();
    await refreshActionUi(counters);
    if (isSleepModeActive) return;

    void runPostMonitorCycle();
  }
});

ensureSleepScheduleAlarm();
void loadNotificationInboxState().then(({ counters }) =>
  refreshActionUi(counters),
);

// Handler principal de mensagens
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // ── panelOpened (single-tab guard) ───────────────────────
  if (message.type === "panelOpened") {
    (async () => {
      try {
        const senderTabId = typeof sender?.tab?.id === "number" ? sender.tab.id : null;
        const extTabs = await getExtensionTabs();
        if (extTabs.length <= 1) {
          sendResponse({ success: true, duplicateClosed: false });
          return;
        }

        // Se abriu uma nova aba, mantém a já existente e fecha a nova (sender).
        const existing = extTabs.find((tab) => tab.id !== senderTabId);
        const keepId = existing?.id ?? senderTabId;
        await enforceSingleExtensionTab(keepId);
        sendResponse({ success: true, duplicateClosed: true, keepTabId: keepId });
      } catch (err) {
        sendResponse({
          success: false,
          error: err?.message || "Failed to enforce single extension tab.",
        });
      }
    })();
    return true;
  }

  // ── resetBackgroundState ──────────────────────────────────
  if (message.type === "resetBackgroundState") {
    isFirstRun = true;
    cutoffTimestamp = 0;
    console.log(
      "[INFO] Background state reset - firstrun set to true, cutoffUnix set to 0",
    );
    return true;
  }

  // ── getGroups ─────────────────────────────────────────────
  if (message.type === "getGroups") {
    (async () => {
      try {
        const authToken = await getAuthToken();
        if (!authToken) {
          sendResponse({
            success: false,
            error: "Not logged in. Please log in to Facebook and try again.",
          });
          return;
        }

        const result = await fetchFacebookGroups("", authToken);

        if (
          result &&
          typeof result === "object" &&
          !Array.isArray(result) &&
          "noGroups" in result
        ) {
          sendResponse({ success: true, groups: [], noGroups: true });
        } else {
          const groups = Array.isArray(result) ? result : result?.groups || [];
          sendResponse({ success: true, groups });
        }
      } catch (err) {
        sendResponse({
          success: false,
          error: err.message || "UNKNOWN ERROR Please contact support",
        });
      }
    })();
    return true;
  }

  // ── startGroupsStream ─────────────────────────────────────
  if (message.type === "startGroupsStream") {
    if (isGroupsFetchRunning) {
      sendResponse({
        success: false,
        error: "Busca de grupos já está em andamento.",
      });
      return true;
    }

    isGroupsFetchRunning = true;
    shouldStopGroupsFetch = false;

    (async () => {
      try {
        const authToken = await getAuthToken();
        if (!authToken) {
          chrome.runtime.sendMessage({
            type: "groupsStreamDone",
            success: false,
            error: "Não foi possível obter token de autenticação.",
          });
          return;
        }

        const result = await fetchFacebookGroups("", authToken, 0, true);
        const groups = Array.isArray(result) ? result : result?.groups || [];

        chrome.runtime.sendMessage({
          type: "groupsStreamDone",
          success: true,
          stopped: shouldStopGroupsFetch,
          total: groups.length,
        });
      } catch (err) {
        chrome.runtime.sendMessage({
          type: "groupsStreamDone",
          success: false,
          error: err?.message || "Erro ao buscar grupos.",
        });
      } finally {
        isGroupsFetchRunning = false;
        shouldStopGroupsFetch = false;
      }
    })();

    sendResponse({ success: true, started: true });
    return true;
  }

  // ── stopGroupsStream ──────────────────────────────────────
  if (message.type === "stopGroupsStream") {
    shouldStopGroupsFetch = true;
    sendResponse({ success: true, stopping: true });
    return true;
  }

  // ── checkLogin ────────────────────────────────────────────
  if (message.type === "checkLogin") {
    (async () => {
      try {
        const { loggedIn, userId } = await fetchCurrentUserId();
        sendResponse({ loggedIn, userId });
      } catch (err) {
        sendResponse({
          loggedIn: false,
          error: err.message || "UNKNOWN ERROR Please contact support",
        });
      }
    })();
    return true;
  }

  // ── getCreationDate ───────────────────────────────────────
  if (message.type === "getCreationDate") {
    (async () => {
      try {
        const result = await fetchProfileCreationDate();
        if (result?.creationDate) {
          sendResponse({ success: true, creationDate: result.creationDate });
        } else {
          sendResponse({ success: false });
        }
      } catch {
        sendResponse({ success: false });
      }
    })();
    return true;
  }

  // ── getLatestPosts ────────────────────────────────────────
  if (message.type === "getLatestPosts") {
    (async () => {
      try {
        const latestPosts = await fetchGroupFeedPosts();
        chrome.runtime.sendMessage({
          type: "take_profiles",
          good: true,
          latest_posts: latestPosts,
        });
      } catch (err) {
        const errorMessage = await serializeError(err);
        log(errorMessage);
        log("Error: 0192019");
        chrome.runtime.sendMessage({
          type: "take_profiles",
          good: false,
          error_msg: errorMessage,
        });
      }
    })();
    return true;
  }

  // ── startPostMonitor ──────────────────────────────────────
  if (message.type === "startPostMonitor") {
    if (isMonitorRunning) {
      sendResponse({
        success: false,
        error: "Monitor já está em execução.",
      });
      return true;
    }

    const payload = message.payload || {};
    monitorConfig = normalizeMonitorConfig(payload);

    (async () => {
      try {
        isFirstRun = true;
        cutoffTimestamp = 0;
        monitorWarmupDone = false;
        isSleepModeActive = false;
        wasRunningBeforeSleep = false;
        monitorConnectionIssue = null;
        isMonitorRunning = true;
        await saveMonitorRuntime();
        chrome.alarms.clear(MONITOR_ALARM_NAME);
        ensureSleepScheduleAlarm();
        await applySleepModeTransition();
        const { counters } = await loadNotificationInboxState();
        await refreshActionUi(counters);

        if (isSleepModeActive) {
          sendResponse({
            success: true,
            running: false,
            sleeping: true,
          });
          return;
        }

        chrome.runtime.sendMessage({
          type: "monitorState",
          running: true,
          profileName: monitorConfig.profileName,
        });

        void runPostMonitorCycle();
        sendResponse({ success: true, running: true });
      } catch (err) {
        sendResponse({
          success: false,
          error: err?.message || "Falha ao iniciar monitor.",
        });
      }
    })();
    return true;
  }

  // ── stopPostMonitor ───────────────────────────────────────
  if (message.type === "stopPostMonitor") {
    (async () => {
      await stopPostMonitor(true);
      sendResponse({ success: true, running: false });
    })();
    return true;
  }

  // ── getPostMonitorState ───────────────────────────────────
  if (message.type === "getPostMonitorState") {
    (async () => {
      const runtime = await loadMonitorRuntime();
      sendResponse(buildMonitorStateResponse(runtime, {
        isMonitorRunning,
        isSleepModeActive,
        monitorConfig,
        monitorConnectionIssue,
      }));
    })();
    return true;
  }

  // ── getSleepSchedule ──────────────────────────────────────
  if (message.type === "getSleepSchedule") {
    (async () => {
      const schedule = await loadSleepSchedule();
      sendResponse({ success: true, schedule });
    })();
    return true;
  }

  // ── setSleepSchedule ──────────────────────────────────────
  if (message.type === "setSleepSchedule") {
    (async () => {
      try {
        const next = normalizeSleepSchedule(message.schedule);
        await chrome.storage.local.set({ [SLEEP_SCHEDULE_STORAGE_KEY]: next });
        ensureSleepScheduleAlarm();
        await applySleepModeTransition();
        sendResponse({ success: true, schedule: next });
      } catch (err) {
        sendResponse({
          success: false,
          error: err?.message || "Failed to save sleep schedule.",
        });
      }
    })();
    return true;
  }

  // ── getLeadHistory ────────────────────────────────────────
  if (message.type === "getLeadHistory") {
    (async () => {
      try {
        const leads = await getLeadsHistory();
        sendResponse({ success: true, leads });
      } catch (err) {
        sendResponse({
          success: false,
          error: err?.message || "Falha ao carregar histórico de leads.",
        });
      }
    })();
    return true;
  }

  // ── markNotificationsSeen ────────────────────────────────
  if (message.type === "markNotificationsSeen") {
    (async () => {
      try {
        const result = await markAllNotificationsSeen();
        sendResponse({ success: true, counters: result.counters });
      } catch (err) {
        sendResponse({
          success: false,
          error: err?.message || "Falha ao marcar notificações como vistas.",
        });
      }
    })();
    return true;
  }

  // ── getNotificationCounters ──────────────────────────────
  if (message.type === "getNotificationCounters") {
    (async () => {
      try {
        const { counters } = await loadNotificationInboxState();
        sendResponse({ success: true, counters });
      } catch (err) {
        sendResponse({
          success: false,
          error: err?.message || "Falha ao carregar contadores de notificações.",
        });
      }
    })();
    return true;
  }

  // ── clearLeadHistory ──────────────────────────────────────
  if (message.type === "clearLeadHistory") {
    (async () => {
      try {
        await chrome.storage.local.set({ [LEADS_HISTORY_STORAGE_KEY]: [] });
        await clearNotificationInboxState();
        sendResponse({ success: true });
      } catch (err) {
        sendResponse({
          success: false,
          error: err?.message || "Falha ao limpar histórico de leads.",
        });
      }
    })();
    return true;
  }

  // ── testNotificationChannel ───────────────────────────────
  if (message.type === "testNotificationChannel") {
    (async () => {
      try {
        const channel = String(message.channel || "").trim();
        const settings =
          message.settings && typeof message.settings === "object"
            ? message.settings
            : await loadNotificationSettings();
        const payload = message.payload || {
          alert_name: "Test alert",
          lead_name: "Test lead",
          group: "Test group",
          post_text: "This is a test notification payload.",
          post_url: "https://www.facebook.com/",
          matched_keywords: [],
          detected_at: new Date().toISOString(),
        };

        let result = { ok: false, error: "invalid channel" };
        if (channel === "desktop") {
          result = await sendDesktopLeadNotification(payload);
        } else if (channel === "webhook") {
          result = await sendWebhookLeadNotification(
            String(settings.webhookUrl || ""),
            payload,
          );
        } else if (channel === "telegram") {
          result = await sendTelegramLeadNotification(
            String(settings.telegramChatId || ""),
            payload,
          );
        }

        sendResponse({
          success: !!result.ok,
          error: result.ok ? "" : result.error || "notification test failed",
        });
      } catch (err) {
        sendResponse({
          success: false,
          error: err?.message || "notification test failed",
        });
      }
    })();
    return true;
  }

  // ── checkWebhookPermission ────────────────────────────────
  if (message.type === "checkWebhookPermission") {
    const webhookUrl = message.webhookUrl;

    const grantPermission = (granted) => sendResponse({ granted });
    const toOriginPattern = (url) => {
      try {
        const parsed = new URL(String(url || ""));
        if (!["http:", "https:"].includes(parsed.protocol)) return "";
        return `${parsed.origin}/*`;
      } catch {
        return "";
      }
    };
    const originPattern = toOriginPattern(webhookUrl);

    if (!originPattern) {
      log("Invalid webhook URL");
      grantPermission(false);
      return true;
    }

    chrome.permissions.contains({ origins: [originPattern] }, (alreadyGranted) => {
      if (alreadyGranted) {
        grantPermission(true);
        return;
      }

      log("permission not granted");

      chrome.permissions.request({ origins: [originPattern] }, (granted) => {
        if (granted) {
          log(`Permission granted for ${originPattern}`);
          grantPermission(true);
        } else {
          log(`Permission denied for ${originPattern}`);
          grantPermission(false);
        }
      });
    });

    return true;
  }
});
