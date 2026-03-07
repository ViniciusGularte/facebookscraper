import { qs, qsa } from "./dom.js";
import {
  STORAGE_SELECTED_GROUP_IDS_KEY,
  STORAGE_MONITOR_CONFIG_KEY,
  STORAGE_PROFILES_KEY,
  STORAGE_LOADED_GROUPS_KEY,
  STORAGE_GLOBAL_FREQUENCY_KEY,
  STORAGE_LANGUAGE_KEY,
  STORAGE_PLAN_STATE_KEY,
  STORAGE_LICENSE_SESSION_KEY,
  STORAGE_LICENSE_EMAIL_KEY,
  STORAGE_DEVICE_ID_KEY,
  STORAGE_TERMS_ACCEPTANCE_KEY,
  STORAGE_ONBOARDING_STATE_KEY,
  STORAGE_NOTIFICATION_SETTINGS_KEY,
  STORAGE_GUIDED_TIPS_DISMISSED_KEY,
  PLAN_CACHE_TTL_MS,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  GUMROAD_PRODUCT_URL,
  LICENSE_ACCESS_FUNCTION_PATH,
  PROFILE_WIZARD_STEPS,
  ORB_STATES,
} from "./constants.js";
import { I18N } from "./i18n-dict.js";
import { filterLeads } from "./leads-filter.js";
import {
  applyWebhookPermissionResult,
  mergeNotificationSettings,
} from "./notification-settings.js";
import { upsertProfile } from "./profile-upsert.js";
import {
  buildDefaultNotificationSettings,
  buildWorkspaceResetState,
} from "./workspace-reset.js";

let selectedGroupIds = new Set();
const lastLoadedGroups = new Map();
let isGroupFetchRunning = false;
let isMonitorRunning = false;
let savedProfiles = [];
let selectedProfileId = "";
let leadsHistory = [];
let orbStateTimeout = null;
let currentLanguage = "en";
const SUPPORTED_LANGUAGES = new Set(["en", "pt-br", "es", "fr", "de"]);
const TERMS_VERSION = "v1";
let technicalLogEntries = [];
let sleepScheduleState = null;
let onboardingState = "welcome";
let fbConnectFailures = 0;
let isFacebookConnected = false;
let lastFacebookUserId = "";
let welcomeNudgeTimer = null;
let onboardAlertFrequency = { min: 3, max: 8 };
let globalMonitorFrequency = { min: 3, max: 8 };
let onboardWatchKeywords = [];
let onboardExcludeKeywords = [];
let profileWatchKeywords = [];
let profileExcludeKeywords = [];
let isProfileBuilderOpen = true;
let currentGuidedActions = [];
let guidedCommandHistory = [];
let guidedHistoryCursor = -1;
let onboardingAutoGroupLoadAttempted = false;
let guidedTipsDismissed = false;
let onboardingGroupsProgress = {
  started: false,
  lastCount: 0,
  lastAnnouncedAt: 0,
};
let isCheckingFacebookLogin = false;
let lastOnboardingChatSignature = "";
let activePlanRefreshPromise = null;
let notificationSettings = buildDefaultNotificationSettings();
let currentProfileWizardStep = "name";
const PLAN_SYNC_INTERVAL_MS = 60000;
const PLAN_SYNC_FAILURE_BACKOFF_MS = 5 * 60 * 1000;
const LICENSE_TRIAL_DURATION_MS = 2 * 24 * 60 * 60 * 1000;
let nextPlanSyncAt = 0;
let isTermsAccepted = false;
let authMode = "";
let licenseSessionVersion = 0;

function appendLog(logId, text, type = "") {
  const log = qs(logId);
  if (!log) return;
  const line = document.createElement("div");
  line.className = type;
  const time = new Date().toLocaleTimeString();
  const entry = `[${time}] ${text}`;
  line.textContent = entry;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
  technicalLogEntries.push({ ts: time, text, type });
  if (technicalLogEntries.length > 2000) {
    technicalLogEntries = technicalLogEntries.slice(-2000);
  }
  renderTechnicalLogOverlay();
}

function renderTechnicalLogOverlay() {
  const body = qs("logOverlayBody");
  if (!body) return;
  body.innerHTML = "";
  if (!technicalLogEntries.length) {
    body.textContent = translate("overlay.empty");
    return;
  }
  for (const item of technicalLogEntries) {
    const row = document.createElement("div");
    row.style.color =
      item.type === "err"
        ? "var(--error)"
        : item.type === "warn"
          ? "var(--warn)"
          : item.type === "ok"
            ? "var(--green)"
            : "var(--text-muted)";
    row.textContent = `[${item.ts}] ${item.text}`;
    body.appendChild(row);
  }
  body.scrollTop = body.scrollHeight;
}

function toggleTechnicalLogOverlay(open) {
  const overlay = qs("logOverlay");
  if (!overlay) return;
  overlay.classList.toggle("open", !!open);
}

function toggleTermsOverlay(open) {
  const overlay = qs("termsOverlay");
  if (!overlay) return;
  overlay.classList.toggle("open", !!open);
}

function syncAuthTermsUi() {
  const checkbox = qs("authTermsAccepted");
  const activateBtn = qs("btnAuthVerifyCode");
  const trialBtn = qs("btnAuthResend");
  if (checkbox) {
    checkbox.checked = isTermsAccepted;
  }
  if (activateBtn) {
    activateBtn.disabled = !isTermsAccepted;
  }
  if (trialBtn) {
    trialBtn.disabled = !isTermsAccepted;
  }
}

function setAuthMode(mode = "") {
  authMode = mode === "trial" || mode === "license" ? mode : "";
  qs("authLicenseSection")?.toggleAttribute("hidden", authMode !== "license");
  qs("authTrialSection")?.toggleAttribute("hidden", authMode !== "trial");
  qs("btnAuthModeLicense")?.classList.toggle("active", authMode === "license");
  qs("btnAuthModeTrial")?.classList.toggle("active", authMode === "trial");
}

function setTrialUpsellVisible(show) {
  qs("dashboardTrialCta")?.toggleAttribute("hidden", !show);
}

function formatTrialRemainingTime(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / (60 * 1000)));
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) {
    if (hours > 0) return `${days}d ${hours}h`;
    return `${days}d`;
  }
  if (hours > 0) {
    if (minutes > 0) return `${hours}h ${minutes}m`;
    return `${hours}h`;
  }
  return `${minutes}m`;
}

function beginLicenseSessionRequest(exclusive = false) {
  if (exclusive) {
    licenseSessionVersion += 1;
  }
  return licenseSessionVersion;
}

function isCurrentLicenseSessionRequest(version) {
  return Number(version) === licenseSessionVersion;
}

function resetAuthGateFields() {
  if (qs("authEmail")) qs("authEmail").value = "";
  if (qs("authCode")) qs("authCode").value = "";
  setAuthMode("");
  setTrialUpsellVisible(false);
}

async function loadTermsAcceptanceState() {
  const data = await chrome.storage.local.get([STORAGE_TERMS_ACCEPTANCE_KEY]);
  const raw = data?.[STORAGE_TERMS_ACCEPTANCE_KEY];
  isTermsAccepted =
    !!raw &&
    typeof raw === "object" &&
    !!raw.accepted &&
    String(raw.version || "") === TERMS_VERSION;
  syncAuthTermsUi();
}

async function setTermsAccepted(accepted) {
  isTermsAccepted = !!accepted;
  if (isTermsAccepted) {
    await chrome.storage.local.set({
      [STORAGE_TERMS_ACCEPTANCE_KEY]: {
        accepted: true,
        version: TERMS_VERSION,
        acceptedAt: Date.now(),
      },
    });
  }
  syncAuthTermsUi();
}

function formatTechnicalLogForClipboard() {
  return technicalLogEntries
    .map((item) => `[${item.ts}] ${item.text}`)
    .join("\n");
}

function translate(key, vars = {}) {
  const raw = I18N[currentLanguage]?.[key] || I18N.en[key] || key;
  return Object.entries(vars).reduce((acc, [k, v]) => {
    return acc.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
  }, raw);
}

const SUPPORT_CONTACT_EMAIL = "grabclientsnow@gmail.com";

function buildLocalizedMailto(subjectKey, bodyKey = "") {
  const subject = translate(subjectKey);
  const body = bodyKey ? translate(bodyKey) : "";
  const params = [`subject=${encodeURIComponent(subject)}`];
  if (body) params.push(`body=${encodeURIComponent(body)}`);
  return `mailto:${SUPPORT_CONTACT_EMAIL}?${params.join("&")}`;
}

function applyLocalizedMailtoLinks() {
  const assign = (id, subjectKey, bodyKey = "") => {
    const el = qs(id);
    if (!el) return;
    el.setAttribute("href", buildLocalizedMailto(subjectKey, bodyKey));
  };

  assign("linkGuidedContactSupport", "mail.subject.support");
  assign("btnAskMoreChannels", "mail.subject.more_channels");
  assign("linkRoadmapSecondary", "mail.subject.roadmap_suggestion");
  assign("linkHelpFeature", "mail.subject.feature_suggestion");
  assign("linkHelpPartner", "mail.subject.partner_inquiry");
  assign("linkHelpAffiliate", "mail.subject.affiliate_join");
}

function applyI18n() {
  document.documentElement.lang =
    currentLanguage === "pt-br"
      ? "pt-BR"
      : currentLanguage === "es"
        ? "es-ES"
        : currentLanguage === "fr"
          ? "fr-FR"
          : currentLanguage === "de"
            ? "de-DE"
            : "en-US";
  qsa("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (!key) return;
    const localized = translate(key);
    el.textContent = localized;
    if (
      key.startsWith("sugg.") &&
      el instanceof HTMLElement &&
      el.hasAttribute("data-value")
    ) {
      el.dataset.value = localized;
    }
  });
  qsa("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (!key) return;
    el.setAttribute("placeholder", translate(key));
  });

  const languageSelect = qs("languageSelect");
  if (languageSelect) languageSelect.value = currentLanguage;
  const authLanguageSelect = qs("authLanguageSelect");
  if (authLanguageSelect) authLanguageSelect.value = currentLanguage;
  applyLocalizedMailtoLinks();
  qsa(".btn").forEach((btn) => {
    btn.dataset.label = btn.textContent;
  });
}

function activateTab(tabName) {
  qsa(".tab-btn").forEach((b) => b.classList.remove("active"));
  const activeButton = qsa(".tab-btn").find((b) => b.dataset.tab === tabName);
  if (activeButton) activeButton.classList.add("active");
  qsa(".panel").forEach((p) => {
    p.classList.toggle("active", p.dataset.panel === tabName);
  });
  if (tabName === "leads") {
    chrome.runtime.sendMessage({ type: "markNotificationsSeen" }, () => {});
  }
  if (tabName === "profiles") {
    if (!selectedProfileId && savedProfiles.length) {
      selectedProfileId = String(savedProfiles[0]?.id || "");
    }
    if (isProfileBuilderOpen && selectedProfileId && getProfileById(selectedProfileId)) {
      selectProfile(selectedProfileId, false);
    } else {
      qs("profileEditorName").value = "";
      qs("profileEditorPositive").value = "";
      qs("profileEditorNegative").value = "";
      qs("profileEditorMin").value = String(globalMonitorFrequency.min);
      qs("profileEditorMax").value = String(globalMonitorFrequency.max);
      syncProfileEditorChipsFromFields();
    }
    currentProfileWizardStep = "name";
    renderProfiles();
    updateMonitorProfilePreview();
    updateProfileKeywordPreview();
    renderProfileWizard();
  }
}

async function setOnboardingState(nextState) {
  onboardingState = nextState;
  if (nextState !== "groups") {
    onboardingAutoGroupLoadAttempted = false;
    onboardingGroupsProgress = { started: false, lastCount: 0, lastAnnouncedAt: 0 };
  }
  await chrome.storage.local.set({ [STORAGE_ONBOARDING_STATE_KEY]: nextState });
  renderOnboardingChat();
}

function onboardingStepRank(state) {
  const order = {
    welcome: 0,
    fb_connect: 1,
    groups: 2,
    alert: 3,
    ready: 4,
  };
  return order[String(state)] ?? 0;
}

function deriveOnboardingStateFromContext() {
  if (isMonitorRunning) return "ready";
  if (savedProfiles.length > 0) return "ready";
  if (selectedGroupIds.size > 0) return "alert";
  return "welcome";
}

async function loadOnboardingState() {
  const data = await chrome.storage.local.get([STORAGE_ONBOARDING_STATE_KEY]);
  const value = String(data?.[STORAGE_ONBOARDING_STATE_KEY] || "").trim();
  const allowed = new Set(["welcome", "fb_connect", "groups", "alert", "ready"]);
  onboardingState = allowed.has(value) ? value : "welcome";
}

async function loadGuidedTipsPreference() {
  const data = await chrome.storage.local.get([STORAGE_GUIDED_TIPS_DISMISSED_KEY]);
  guidedTipsDismissed = !!data?.[STORAGE_GUIDED_TIPS_DISMISSED_KEY];
}

function applyGuidedTipsVisibility() {
  const block = qs("guidedTipsBlock");
  if (!block) return;
  block.classList.toggle("dismissed", guidedTipsDismissed);
}

async function dismissGuidedTips() {
  guidedTipsDismissed = true;
  applyGuidedTipsVisibility();
  await chrome.storage.local.set({ [STORAGE_GUIDED_TIPS_DISMISSED_KEY]: true });
}

async function refreshOnboardingStateFromContext() {
  const derived = deriveOnboardingStateFromContext();

  if (onboardingState === "ready" && derived !== "ready") {
    await setOnboardingState(derived);
    return;
  }

  // Não avança automaticamente de grupos -> alerta ao marcar o primeiro grupo.
  // O usuário precisa confirmar explicitamente pelo botão de continuar.
  if (onboardingState === "groups" && derived === "alert") {
    renderOnboardingChat();
    return;
  }

  if (onboardingStepRank(derived) > onboardingStepRank(onboardingState)) {
    await setOnboardingState(derived);
    return;
  }

  renderOnboardingChat();
}

function setHomeOperationalVisibility(show) {
  ["cardSystemState"].forEach((id) => {
    const el = qs(id);
    if (!el) return;
    el.classList.toggle("hidden", !show);
  });
}

function addAgentMessage(container, text, muted = false, typing = true) {
  const row = document.createElement("div");
  row.className = `agent-msg${muted ? " muted" : ""}`;
  container.appendChild(row);
  const content = String(text || "");
  if (!typing || content.length < 2) {
    row.textContent = content;
    return;
  }
  row.classList.add("typing");
  let idx = 0;
  const timer = setInterval(() => {
    idx += 1;
    row.textContent = content.slice(0, idx);
    if (idx >= content.length) {
      clearInterval(timer);
      row.classList.remove("typing");
    }
  }, 14);
}

function buildOnboardingChatSignature(parts = []) {
  return parts
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join("||");
}

function clearWelcomeNudgeTimer() {
  if (!welcomeNudgeTimer) return;
  clearTimeout(welcomeNudgeTimer);
  welcomeNudgeTimer = null;
}

function scheduleWelcomeNudge() {
  clearWelcomeNudgeTimer();
  if (onboardingState !== "welcome") return;
  welcomeNudgeTimer = setTimeout(() => {
    if (onboardingState !== "welcome") return;
    const feed = qs("agentFeed");
    if (!feed) return;
    const alreadyHasNudge = Array.from(feed.querySelectorAll(".agent-msg")).some(
      (el) =>
        el.textContent?.includes("Whenever you're ready") ||
        el.textContent?.includes("Quando quiser"),
    );
    if (!alreadyHasNudge) {
      addAgentMessage(feed, getOnboardingCopy().welcomeNudge, true);
    }
  }, 30000);
}

function getSelectedGroupNamesSummary(limit = 5) {
  const selected = Array.from(selectedGroupIds)
    .map((id) => lastLoadedGroups.get(String(id))?.name)
    .filter(Boolean);
  if (!selected.length) {
    return translate("groups.none_selected_yet");
  }
  if (selected.length <= limit) return selected.join(", ");
  const first = selected.slice(0, limit).join(", ");
  return currentLanguage === "pt-br"
    ? `${first} e mais ${selected.length - limit}`
    : `${first} and ${selected.length - limit} more`;
}

function getOnboardingCopy() {
  return {
    welcome1: translate("onboard.welcome1"),
    welcome2: translate("onboard.welcome2"),
    welcomeNudge: translate("onboard.welcome_nudge"),
    connect1: translate("onboard.connect1"),
    connect2: translate("onboard.connect2"),
    connectFail: translate("onboard.connect_fail"),
    groups1: translate("onboard.groups1"),
    alert1: translate("onboard.alert1"),
    alert2: translate("onboard.alert2"),
    ready1: translate("onboard.ready1"),
  };
}

function updateOnboardingWorkspaceVisibility() {
  const workspace = qs("onboardingWorkspace");
  const groupsPanel = qs("onboardGroupsPanel");
  const alertPanel = qs("onboardAlertPanel");
  if (!workspace || !groupsPanel || !alertPanel) return;

  const showWorkspace = onboardingState === "groups" || onboardingState === "alert";
  workspace.classList.toggle("show", showWorkspace);
  groupsPanel.classList.toggle("active", onboardingState === "groups");
  alertPanel.classList.toggle("active", onboardingState === "alert");
}

function renderOnboardingGroupsList() {
  const list = qs("onboardGroupsList");
  const info = qs("onboardGroupsInfo");
  if (!list || !info) return;

  const search = String(qs("onboardGroupsSearch")?.value || "")
    .trim()
    .toLowerCase();
  list.innerHTML = "";

  const groups = Array.from(lastLoadedGroups.values()).filter((g) => {
    if (!search) return true;
    return String(g?.name || "").toLowerCase().includes(search);
  });

  groups.forEach((g) => {
    const row = createGroupCard(g);
    list.appendChild(row);
  });

  if (!groups.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = search
      ? translate("groups.no_match", { term: search })
      : translate("groups.no_loaded_auto");
    list.appendChild(empty);
  }

  const loadedEl = qs("onboardGroupsLoadedCount");
  const selectedEl = qs("onboardGroupsSelectedCount");
  if (loadedEl) loadedEl.textContent = translate("groups.loaded_count", { count: lastLoadedGroups.size });
  if (selectedEl) selectedEl.textContent = translate("groups.selected_count", { count: selectedGroupIds.size });
  info.textContent = groups.length
    ? translate("groups.visible_count", { count: groups.length })
    : (search
      ? translate("groups.visible_for_count", { count: 0, term: search })
      : translate("groups.visible_count", { count: 0 }));
}

function maybeAutoLoadOnboardingGroups() {
  if (onboardingState !== "groups") return;
  if (onboardingAutoGroupLoadAttempted) return;
  if (isGroupFetchRunning) return;
  onboardingAutoGroupLoadAttempted = true;
  onboardingGroupsProgress.started = true;
  onboardingGroupsProgress.lastCount = 0;
  onboardingGroupsProgress.lastAnnouncedAt = Date.now();
  appendLog("logGeneral", translate("onboard.auto_loading"), "ok");
  setTimeout(() => {
    const loadMain = qs("btnGetGroups");
    if (loadMain) loadMain.click();
  }, 120);
}

function syncOnboardingAlertFromSelectedProfile() {
  const profile = getProfileById(selectedProfileId);
  if (profile) {
    qs("onboardAlertName").value = String(profile.name || "");
    onboardWatchKeywords = Array.isArray(profile.positiveKeywords)
      ? profile.positiveKeywords.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    onboardExcludeKeywords = Array.isArray(profile.negativeKeywords)
      ? profile.negativeKeywords.map((v) => String(v || "").trim()).filter(Boolean)
      : [];
    onboardAlertFrequency = {
      min: Number(globalMonitorFrequency?.min) || 5,
      max: Number(globalMonitorFrequency?.max) || 10,
    };
  } else {
    const defaults =
      Number(globalMonitorFrequency?.min) > 0
        ? globalMonitorFrequency
        : getDefaultFrequencyForPlan();
    qs("onboardAlertName").value = "";
    onboardWatchKeywords = [];
    onboardExcludeKeywords = [];
    onboardAlertFrequency = { min: defaults.min, max: defaults.max };
  }
  renderOnboardKeywordChips("watch");
  renderOnboardKeywordChips("exclude");
  const freqText = qs("onboardAlertFreqText");
  if (freqText) {
    freqText.textContent = translate("settings.frequency_current", {
      min: onboardAlertFrequency.min,
      max: onboardAlertFrequency.max,
    });
  }
  const freqWarn = qs("onboardFreqWarning");
  if (freqWarn) freqWarn.textContent = "";
}

function normalizeOnboardKeyword(value) {
  return String(value || "").trim().toLowerCase();
}

function renderOnboardKeywordChips(kind) {
  const isWatch = kind === "watch";
  const list = isWatch ? onboardWatchKeywords : onboardExcludeKeywords;
  const container = qs(isWatch ? "onboardWatchChips" : "onboardExcludeChips");
  const hidden = qs(isWatch ? "onboardAlertWatch" : "onboardAlertExclude");
  if (!container || !hidden) return;
  container.innerHTML = "";
  hidden.value = list.join(", ");

  list.forEach((kw, idx) => {
    const chip = document.createElement("span");
    chip.className = `tag-chip ${isWatch ? "pos" : "neg"}`;
    chip.textContent = kw;
    const close = document.createElement("button");
    close.textContent = "×";
    close.addEventListener("click", () => {
      list.splice(idx, 1);
      renderOnboardKeywordChips(kind);
    });
    chip.appendChild(close);
    container.appendChild(chip);
  });
}

function addOnboardKeyword(kind, rawValue) {
  const value = normalizeOnboardKeyword(rawValue);
  const isWatch = kind === "watch";
  const list = isWatch ? onboardWatchKeywords : onboardExcludeKeywords;
  const container = qs(isWatch ? "onboardWatchChips" : "onboardExcludeChips");
  if (!value) return false;
  if (value.length < 2) {
    appendLog("logGeneral", translate("onboard.keyword_min"), "warn");
    return false;
  }
  if (list.length >= 20) {
    appendLog("logGeneral", translate("onboard.keyword_max"), "warn");
    return false;
  }
  const existingIndex = list.findIndex((item) => normalizeOnboardKeyword(item) === value);
  if (existingIndex >= 0) {
    const existingChip = container?.children?.[existingIndex];
    if (existingChip) {
      existingChip.classList.add("flash");
      setTimeout(() => existingChip.classList.remove("flash"), 450);
    }
    return false;
  }
  list.push(value);
  renderOnboardKeywordChips(kind);
  return true;
}

async function saveOnboardingAlert() {
  const name = String(qs("onboardAlertName")?.value || "").trim();
  const watch = onboardWatchKeywords.join(", ");
  const exclude = onboardExcludeKeywords.join(", ");
  qs("profileEditorName").value = name;
  qs("profileEditorPositive").value = watch;
  qs("profileEditorNegative").value = exclude;
  qs("profileEditorMin").value = String(globalMonitorFrequency.min);
  qs("profileEditorMax").value = String(globalMonitorFrequency.max);

  const ok = await saveProfileFromEditor();
  if (!ok) {
    appendLog("logGeneral", translate("onboard.create_save_first"), "warn");
    return false;
  }
  await setOnboardingState("ready");
  return true;
}

function normalizeProfileKeyword(value) {
  return String(value || "").trim().toLowerCase();
}

function renderProfileKeywordChips(kind) {
  const isWatch = kind === "watch";
  const list = isWatch ? profileWatchKeywords : profileExcludeKeywords;
  const container = qs(isWatch ? "profileWatchChips" : "profileExcludeChips");
  const hidden = qs(isWatch ? "profileEditorPositive" : "profileEditorNegative");
  if (!container || !hidden) return;

  hidden.value = list.join(", ");
  container.innerHTML = "";

  list.forEach((kw, idx) => {
    const chip = document.createElement("span");
    chip.className = `tag-chip ${isWatch ? "pos" : "neg"}`;
    chip.textContent = kw;
    const close = document.createElement("button");
    close.textContent = "×";
    close.addEventListener("click", () => {
      list.splice(idx, 1);
      renderProfileKeywordChips(kind);
      updateProfileKeywordPreview();
    });
    chip.appendChild(close);
    container.appendChild(chip);
  });
}

function syncProfileEditorChipsFromFields() {
  profileWatchKeywords = parseKeywordsInput(qs("profileEditorPositive")?.value || "");
  profileExcludeKeywords = parseKeywordsInput(qs("profileEditorNegative")?.value || "");
  renderProfileKeywordChips("watch");
  renderProfileKeywordChips("exclude");
}

function addProfileKeyword(kind, rawValue) {
  const value = normalizeProfileKeyword(rawValue);
  if (!value) return false;
  if (value.length < 2) return false;

  const isWatch = kind === "watch";
  const list = isWatch ? profileWatchKeywords : profileExcludeKeywords;
  const existing = list.findIndex((item) => normalizeProfileKeyword(item) === value);
  if (existing >= 0) return false;

  list.push(value);
  renderProfileKeywordChips(kind);
  updateProfileKeywordPreview();
  return true;
}

function normalizeGuidedText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function renderGuidedHistory() {
  const box = qs("guidedHistory");
  if (!box) return;
  box.innerHTML = "";
  const items = guidedCommandHistory.slice(0, 5);
  items.forEach((cmd) => {
    const chip = document.createElement("span");
    chip.className = "guided-history-chip";
    chip.textContent = cmd;
    box.appendChild(chip);
  });
}

function rememberGuidedCommand(label) {
  const value = String(label || "").trim();
  if (!value) return;
  guidedCommandHistory = [
    value,
    ...guidedCommandHistory.filter((item) => item !== value),
  ].slice(0, 20);
  guidedHistoryCursor = -1;
  renderGuidedHistory();
}

function runGuidedAction(action) {
  if (!action || typeof action.onClick !== "function") return;
  rememberGuidedCommand(action.label);
  const input = qs("guidedPromptInput");
  if (input) input.value = "";
  action.onClick();
}

function getFilteredGuidedActions(query = "") {
  const q = normalizeGuidedText(query).trim();
  if (!q) return currentGuidedActions;
  return currentGuidedActions.filter((action) => {
    const label = normalizeGuidedText(action?.label);
    const keywords = normalizeGuidedText(
      Array.isArray(action?.keywords)
        ? action.keywords.join(" ")
        : action?.keywords || "",
    );
    return label.includes(q) || keywords.includes(q);
  });
}

function renderAgentActionsByQuery(query = "") {
  const box = qs("agentActions");
  if (!box) return;
  box.innerHTML = "";
  const filtered = getFilteredGuidedActions(query);

  filtered.forEach((action) => {
    const btn = document.createElement("button");
    btn.className = `btn ${action.kind || "btn-gray"} agent-option`;
    if (action.hint) btn.title = action.hint;
    if (action.disabled) btn.disabled = true;
    const icon = document.createElement("span");
    icon.className = "icon";
    icon.textContent = action.icon || "•";
    const label = document.createElement("span");
    label.textContent = action.label;
    btn.appendChild(icon);
    btn.appendChild(label);
    btn.addEventListener("click", () => runGuidedAction(action));
    box.appendChild(btn);
  });
}

function setAgentActions(actions) {
  currentGuidedActions = Array.isArray(actions) ? actions : [];
  const query = String(qs("guidedPromptInput")?.value || "");
  renderAgentActionsByQuery(query);
}

function checkFacebookLogin() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "checkLogin" }, (response) => {
      resolve(response || {});
    });
  });
}

async function runOnboardingFacebookCheck(feed) {
  if (isCheckingFacebookLogin) return;
  isCheckingFacebookLogin = true;
  addAgentMessage(feed, translate("onboard.fb_checking"), true, false);
  renderOnboardingChat();
  const response = await checkFacebookLogin();
  isCheckingFacebookLogin = false;
  if (response?.loggedIn) {
    lastFacebookUserId = String(response.userId || "").trim();
    setLoginStatus(true, `${translate("status.logged")}: ${response.userId}`);
    await setOnboardingState("groups");
    return;
  }
  fbConnectFailures += 1;
  addAgentMessage(feed, translate("onboard.fb_not_connected"), true);
  appendLog("logGeneral", translate("onboard.fb_not_connected"), "warn");
  if (fbConnectFailures >= 3) {
    const copy = getOnboardingCopy();
    addAgentMessage(feed, copy.connectFail, true);
    toggleTechnicalLogOverlay(true);
  }
  renderOnboardingChat();
}

function renderOnboardingChat() {
  const copy = getOnboardingCopy();
  const feed = qs("agentFeed");
  const guidedTitle = qs("guidedSetupTitle");
  const guidedCard = qs("cardGuidedSetup");
  if (!feed) return;
  feed.innerHTML = "";
  clearWelcomeNudgeTimer();

  const showOperational = onboardingState === "ready";
  setHomeOperationalVisibility(showOperational);
  updateOnboardingWorkspaceVisibility();
  if (guidedCard) guidedCard.classList.toggle("guided-ready", showOperational);
  applyGuidedTipsVisibility();
  if (guidedTitle) {
    guidedTitle.textContent = translate("home.guided_setup");
  }
  const guidedInput = qs("guidedPromptInput");
  if (guidedInput) {
    const placeholderByState = {
      welcome: currentLanguage === "pt-br"
        ? "Digite para começar..."
        : "Type to start...",
      fb_connect: currentLanguage === "pt-br"
        ? "Confirme login no Facebook..."
        : "Confirm Facebook login...",
      groups: currentLanguage === "pt-br"
        ? "Selecione 1 ou mais grupos..."
        : "Select one or more groups...",
      alert: currentLanguage === "pt-br"
        ? "Crie seu primeiro alerta..."
        : "Create your first alert...",
      ready: currentLanguage === "pt-br"
        ? "Ligar monitoramento..."
        : "Turn on monitoring...",
    };
    guidedInput.placeholder = placeholderByState[onboardingState] ||
      (currentLanguage === "pt-br"
        ? "Digite o que você quer fazer..."
        : "Type what you want to do...");
    if (document.activeElement !== guidedInput) {
      guidedInput.value = "";
    }
  }

  let chatSignature = onboardingState;

  if (onboardingState === "welcome") {
    chatSignature = buildOnboardingChatSignature([
      onboardingState,
      copy.welcome1,
      copy.welcome2,
    ]);
    const shouldAnimate = lastOnboardingChatSignature !== chatSignature;
    lastOnboardingChatSignature = chatSignature;
    addAgentMessage(feed, copy.welcome1, false, shouldAnimate);
    addAgentMessage(feed, copy.welcome2, false, shouldAnimate);
    setAgentActions([
      {
        label: translate("btn.next"),
        kind: "btn-green",
        icon: "▶",
        keywords: currentLanguage === "pt-br"
          ? ["continuar", "comecar", "iniciar"]
          : ["continue", "start", "begin"],
        onClick: async () => setOnboardingState("fb_connect"),
      },
    ]);
    scheduleWelcomeNudge();
    return;
  }

  if (onboardingState === "fb_connect") {
    chatSignature = buildOnboardingChatSignature([
      onboardingState,
      translate("onboard.fb_prompt"),
    ]);
    const shouldAnimate = lastOnboardingChatSignature !== chatSignature;
    lastOnboardingChatSignature = chatSignature;
    addAgentMessage(feed, translate("onboard.fb_prompt"), false, shouldAnimate);
    const actions = [
      {
        label: isCheckingFacebookLogin
          ? translate("common.checking")
          : (currentLanguage === "pt-br" ? "Sim, estou logado" : "Yes, I'm logged in"),
        kind: "btn-green",
        icon: "✅",
        disabled: isCheckingFacebookLogin,
        keywords: currentLanguage === "pt-br"
          ? ["sim", "logado", "continuar"]
          : ["yes", "logged", "continue"],
        onClick: () => runOnboardingFacebookCheck(feed),
      },
      {
        label: currentLanguage === "pt-br" ? "Não, ainda não" : "No, not yet",
        kind: "btn-gray",
        icon: "❌",
        disabled: isCheckingFacebookLogin,
        keywords: currentLanguage === "pt-br"
          ? ["nao", "não", "ainda nao", "nao logado"]
          : ["no", "not yet", "not logged"],
        onClick: () => {
          addAgentMessage(
            feed,
            translate("onboard.fb_no_problem"),
            true,
          );
        },
      },
      {
        label: currentLanguage === "pt-br" ? "Abrir Facebook agora" : "Open Facebook now",
        kind: "btn-gray",
        icon: "🌐",
        disabled: isCheckingFacebookLogin,
        keywords: currentLanguage === "pt-br"
          ? ["facebook", "abrir", "login"]
          : ["facebook", "open", "login"],
        onClick: async () => {
          await chrome.tabs.create({ url: "https://www.facebook.com/" });
        },
      },
    ];
    if (fbConnectFailures > 0) {
      actions.unshift({
        label: translate("btn.try_again"),
        kind: "btn-blue",
        icon: "🔁",
        disabled: isCheckingFacebookLogin,
        keywords: currentLanguage === "pt-br"
          ? ["tentar", "repetir", "retry"]
          : ["try", "retry", "again"],
        onClick: () => runOnboardingFacebookCheck(feed),
      });
    }
    setAgentActions(actions);
    return;
  }

  if (onboardingState === "groups") {
    maybeAutoLoadOnboardingGroups();
    chatSignature = buildOnboardingChatSignature([
      onboardingState,
      translate("onboard.groups_pick"),
    ]);
    const shouldAnimate = lastOnboardingChatSignature !== chatSignature;
    lastOnboardingChatSignature = chatSignature;
    addAgentMessage(feed, translate("onboard.groups_pick"), false, shouldAnimate);
    renderOnboardingGroupsList();
    setAgentActions([
      {
        label: currentLanguage === "pt-br" ? "Já selecionei os grupos" : "I've selected groups",
        kind: "btn-green",
        icon: "👥",
        keywords: currentLanguage === "pt-br"
          ? ["grupos", "selecionar", "continuar"]
          : ["groups", "selected", "continue"],
        onClick: async () => {
          if (selectedGroupIds.size < 1) {
            appendLog("logGeneral", translate("onboard.select_group_first"), "warn");
            return;
          }
          if (isGroupFetchRunning) {
            appendLog(
              "logGeneral",
              translate("onboard.continue_bg_loading"),
              "info",
            );
          }
          await setOnboardingState("alert");
        },
      },
    ]);
    return;
  }

  if (onboardingState === "alert") {
    const alertStatusText = selectedProfileId
      ? translate("onboard.alert_ready")
      : translate("onboard.alert_create_first");
    chatSignature = buildOnboardingChatSignature([
      onboardingState,
      copy.alert1,
      copy.alert2,
      alertStatusText,
    ]);
    const shouldAnimate = lastOnboardingChatSignature !== chatSignature;
    lastOnboardingChatSignature = chatSignature;
    addAgentMessage(feed, copy.alert1, false, shouldAnimate);
    addAgentMessage(feed, copy.alert2, true, shouldAnimate);
    addAgentMessage(feed, alertStatusText, true, shouldAnimate);
    syncOnboardingAlertFromSelectedProfile();
    setAgentActions([
      {
        label: currentLanguage === "pt-br" ? "Concluir setup" : "Finish setup",
        kind: "btn-green",
        icon: "🚀",
        keywords: currentLanguage === "pt-br"
          ? ["concluir", "finalizar", "setup", "alerta"]
          : ["finish", "setup", "alert", "save"],
        onClick: async () => saveOnboardingAlert(),
      },
    ]);
    return;
  }

  const readyText = isMonitorRunning
    ? translate("onboard.monitoring_active_now")
    : translate("onboard.ready_to_monitor");
  chatSignature = buildOnboardingChatSignature([
    onboardingState,
    readyText,
  ]);
  const shouldAnimate = lastOnboardingChatSignature !== chatSignature;
  lastOnboardingChatSignature = chatSignature;
  addAgentMessage(feed, readyText, false, shouldAnimate);
  setAgentActions([]);
}

async function loadLanguage() {
  const data = await chrome.storage.local.get([STORAGE_LANGUAGE_KEY]);
  const stored = data?.[STORAGE_LANGUAGE_KEY];
  const storedNormalized = String(stored || "").toLowerCase();
  if (SUPPORTED_LANGUAGES.has(storedNormalized)) {
    currentLanguage = storedNormalized;
    applyI18n();
    return;
  }

  const browserLocales = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language || "",
  ]
    .map((value) => String(value || "").toLowerCase())
    .filter(Boolean);
  const preferMap = [
    ["pt", "pt-br"],
    ["es", "es"],
    ["fr", "fr"],
  ];
  const detected =
    preferMap.find(([prefix]) =>
      browserLocales.some((locale) => locale.startsWith(prefix)),
    )?.[1] || "en";
  currentLanguage = detected;
  await chrome.storage.local.set({ [STORAGE_LANGUAGE_KEY]: currentLanguage });
  applyI18n();
}

async function setLanguage(nextLanguage) {
  const normalized = String(nextLanguage || "").toLowerCase();
  currentLanguage = SUPPORTED_LANGUAGES.has(normalized) ? normalized : "en";
  await chrome.storage.local.set({ [STORAGE_LANGUAGE_KEY]: currentLanguage });
  rerenderUiAfterLanguageChange();
}

function rerenderUiAfterLanguageChange() {
  applyI18n();
  renderPlanBanner();
  renderOnboardingChat();
  renderOnboardingGroupsList();
  renderProfiles();
  renderLeads();
  updateSelectedGroupCount();
  renderProfileWizard();
  renderHomeInsights();
  renderGroupsLeaderboard();
  setLoginStatus(isFacebookConnected, getFacebookStatusLabel());
  setMonitorState(
    isMonitorRunning,
    qs("monitorStatus")?.textContent ||
      (isMonitorRunning ? translate("status.monitoring") : translate("status.stopped")),
  );
}

function watchStorageUpdates() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    void (async () => {
      if (changes[STORAGE_LANGUAGE_KEY]) {
        const next = String(changes[STORAGE_LANGUAGE_KEY].newValue || "").toLowerCase();
        if (SUPPORTED_LANGUAGES.has(next) && next !== currentLanguage) {
          currentLanguage = next;
        }
        rerenderUiAfterLanguageChange();
      }

      if (changes[STORAGE_PROFILES_KEY]) {
        await loadProfiles();
        updateMonitorProfilePreview();
        updateProfileKeywordPreview();
      }

      if (changes[STORAGE_SELECTED_GROUP_IDS_KEY]) {
        await loadSelectedGroupIds();
        applyGroupsVisibilityFilter();
      }

      if (changes[STORAGE_LOADED_GROUPS_KEY]) {
        lastLoadedGroups.clear();
        if (qs("groupsList")) qs("groupsList").innerHTML = "";
        await loadPersistedGroups();
        applyGroupsVisibilityFilter();
      }

      if (changes[STORAGE_GLOBAL_FREQUENCY_KEY]) {
        await loadGlobalMonitorFrequency();
        updateProfileKeywordPreview();
      }

      if (changes[STORAGE_NOTIFICATION_SETTINGS_KEY]) {
        await loadNotificationSettings();
      }

      if (changes[STORAGE_PLAN_STATE_KEY]) {
        const nextPlan = changes[STORAGE_PLAN_STATE_KEY]?.newValue;
        if (nextPlan && typeof nextPlan === "object") {
          cachedPlanState = nextPlan;
        } else {
          cachedPlanState = await loadPlanState();
        }
        renderPlanBanner();
        renderProfileWizard();
        renderGlobalFrequencyUi();
        setTrialUpsellVisible(resolvePlanLevel() === "trial");
      }

      if (changes[STORAGE_LICENSE_SESSION_KEY] || changes[STORAGE_LICENSE_EMAIL_KEY]) {
        await updateAccountUi();
        const nextSession = changes[STORAGE_LICENSE_SESSION_KEY]?.newValue;
        const nextEmail = String(
          nextSession?.email || changes[STORAGE_LICENSE_EMAIL_KEY]?.newValue || "",
        ).trim();
        setAuthGateVisible(resolvePlanLevel() === "blocked" || (!nextSession?.email && !nextEmail));
        if (!nextSession?.email && !nextSession?.licenseKey && !nextEmail) {
          nextPlanSyncAt = 0;
          setTrialUpsellVisible(false);
        }
      }

      if (changes[STORAGE_ONBOARDING_STATE_KEY]) {
        await loadOnboardingState();
        renderOnboardingChat();
      }
    })();
  });
}

function formatRemainingTime(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

async function loadPlanState() {
  const data = await chrome.storage.local.get([STORAGE_PLAN_STATE_KEY]);
  const plan = data?.[STORAGE_PLAN_STATE_KEY];
  if (plan && typeof plan === "object") return plan;
  const defaultPlan = {
    plan: "free",
    trialEnd: 0,
  };
  await chrome.storage.local.set({ [STORAGE_PLAN_STATE_KEY]: defaultPlan });
  return defaultPlan;
}

let cachedPlanState = null;
function renderPlanBanner() {
  const banner = qs("planBanner");
  const text = qs("planBannerText");
  const hint = qs("planBannerHint");
  const trialDuration = qs("dashboardTrialDuration");
  if (!banner || !text || !hint || !cachedPlanState) return;

  banner.classList.remove("show", "warn", "pro", "free");
  const now = Date.now();
  const plan = String(cachedPlanState.plan || "free");
  const trialEnd = Number(cachedPlanState.trialEnd) || 0;

  if (trialDuration) {
    trialDuration.textContent = "";
  }

  if (plan === "pro") {
    text.textContent = "";
    hint.textContent = "";
    setPlanLockVisible(false);
    return;
  }

  if (plan === "trial") {
    if (trialEnd > now) {
      text.textContent = "";
      hint.textContent = "";
      if (trialDuration) {
        trialDuration.textContent = translate("plan.trial", {
          time: formatTrialRemainingTime(trialEnd - now),
        });
      }
      setPlanLockVisible(false);
      return;
    }
  }

  banner.classList.add("show", "free");
  text.textContent = translate("plan.expired");
  hint.textContent = translate("plan.free_hint");

  if (!qs("authGate")?.classList.contains("show")) {
    setPlanLockVisible(true);
  }
}

function getSupabaseConfig() {
  return {
    url: String(SUPABASE_URL || "").trim(),
    anonKey: String(SUPABASE_ANON_KEY || "").trim(),
    licensePath: String(LICENSE_ACCESS_FUNCTION_PATH || "").trim(),
    gumroadProductUrl: String(GUMROAD_PRODUCT_URL || "").trim(),
  };
}

async function getLicenseSession() {
  const data = await chrome.storage.local.get([STORAGE_LICENSE_SESSION_KEY]);
  return data?.[STORAGE_LICENSE_SESSION_KEY] || null;
}

async function setLicenseSession(session) {
  await chrome.storage.local.set({ [STORAGE_LICENSE_SESSION_KEY]: session });
}

async function clearLicenseSession() {
  licenseSessionVersion += 1;
  const session = await getLicenseSession();
  const deviceId = await getOrCreateDeviceId();
  if (session?.licenseKey) {
    try {
      await callLicenseAccess({
        action: "release_device",
        email: session.email || "license@local.invalid",
        licenseKey: session.licenseKey,
        deviceId,
      });
    } catch (_) {
      // Best-effort release. Local cleanup should still continue.
    }
  }
  await chrome.storage.local.remove([
    STORAGE_LICENSE_SESSION_KEY,
    STORAGE_LICENSE_EMAIL_KEY,
    "authSession",
    "authEmail",
  ]);
  const next = {
    plan: "free",
    trialEnd: 0,
    purchaseDate: 0,
    cachedAt: Date.now(),
    source: "local",
  };
  cachedPlanState = next;
  nextPlanSyncAt = 0;
  resetAuthGateFields();
  await chrome.storage.local.set({ [STORAGE_PLAN_STATE_KEY]: next });
}

async function getOrCreateDeviceId() {
  const data = await chrome.storage.local.get([STORAGE_DEVICE_ID_KEY]);
  const existing = String(data?.[STORAGE_DEVICE_ID_KEY] || "").trim();
  if (existing) return existing;
  const next =
    typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  await chrome.storage.local.set({ [STORAGE_DEVICE_ID_KEY]: next });
  return next;
}

function getDeviceName() {
  const platform = String(navigator?.platform || "").trim();
  const language = String(navigator?.language || "").trim();
  return [platform, language].filter(Boolean).join(" / ") || "Chrome Extension";
}

function setAuthGateVisible(show) {
  const gate = qs("authGate");
  if (!gate) return;
  gate.classList.toggle("show", !!show);
  if (show) setPlanLockVisible(false);
}

function setPlanLockVisible(show) {
  const gate = qs("planLockGate");
  if (!gate) return;
  gate.classList.toggle("show", !!show);
}

function appendAuthGateLog(message, type = "info") {
  appendLog("logAuthGate", message, type);
}

function serviceHeaders(config) {
  return {
    apikey: config.anonKey,
    "Content-Type": "application/json",
  };
}

function readDateLike(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber) && asNumber > 0) return asNumber;
    const asDate = new Date(value).getTime();
    if (Number.isFinite(asDate) && asDate > 0) return asDate;
  }
  return 0;
}

function maskLicenseKey(licenseKey) {
  const clean = String(licenseKey || "").trim();
  if (!clean) return "";
  if (clean.length <= 8) return clean;
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

function normalizeLicensePlan(rawPlan, trialEnd) {
  const plan = String(rawPlan || "").trim().toLowerCase();
  if (["pro", "paid", "active", "lifetime"].includes(plan)) return "pro";
  if (plan === "trial" && trialEnd > Date.now()) return "trial";
  return "free";
}

function normalizeLicenseState(payload, fallback = {}) {
  const trialEnd = readDateLike(payload?.trialEnd ?? payload?.trial_end ?? fallback.trialEnd);
  const purchaseDate = readDateLike(
    payload?.purchaseDate ?? payload?.purchase_date ?? fallback.purchaseDate,
  );
  const email = String(payload?.email || fallback.email || "").trim().toLowerCase();
  const licenseKey = String(payload?.licenseKey || fallback.licenseKey || "").trim();
  const plan = normalizeLicensePlan(payload?.plan || payload?.status, trialEnd);
  return {
    email,
    licenseKey,
    licenseKeyMasked: String(
      payload?.licenseKeyMasked || payload?.license_key_masked || maskLicenseKey(licenseKey),
    ).trim(),
    plan,
    trialEnd,
    purchaseDate,
    deviceId: String(payload?.deviceId || payload?.device_id || fallback.deviceId || "").trim(),
    deviceName: String(
      payload?.deviceName || payload?.device_name || fallback.deviceName || "",
    ).trim(),
    checkedAt: Date.now(),
    source: "supabase",
  };
}

async function persistLicenseState(payload, fallback = {}, requestVersion = licenseSessionVersion) {
  const next = normalizeLicenseState(payload, fallback);
  if (!isCurrentLicenseSessionRequest(requestVersion)) {
    return next;
  }
  await chrome.storage.local.set({
    [STORAGE_LICENSE_SESSION_KEY]: next,
    [STORAGE_LICENSE_EMAIL_KEY]: next.email || fallback.email || "",
    [STORAGE_PLAN_STATE_KEY]: {
      plan: next.plan,
      trialEnd: next.trialEnd,
      purchaseDate: next.purchaseDate,
      cachedAt: Date.now(),
      source: next.source,
    },
  });
  cachedPlanState = {
    plan: next.plan,
    trialEnd: next.trialEnd,
    purchaseDate: next.purchaseDate,
    cachedAt: Date.now(),
    source: next.source,
  };
  return next;
}

async function callLicenseAccess(body) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey || !config.licensePath) {
    throw new Error(translate("auth.missing_config"));
  }
  const response = await fetch(`${config.url}${config.licensePath}`, {
    method: "POST",
    headers: serviceHeaders(config),
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.error || payload?.message || "").trim();
    throw new Error(message || `License request failed (${response.status})`);
  }
  return payload;
}

async function activateLicense(licenseKey) {
  const requestVersion = beginLicenseSessionRequest(true);
  const deviceId = await getOrCreateDeviceId();
  const deviceName = getDeviceName();
  const payload = await callLicenseAccess({
    action: "activate",
    email: "license@local.invalid",
    licenseKey,
    deviceId,
    deviceName,
  });
  return await persistLicenseState(payload, { licenseKey, deviceId, deviceName }, requestVersion);
}

async function startLicenseTrial(email) {
  const requestVersion = beginLicenseSessionRequest(true);
  const deviceId = await getOrCreateDeviceId();
  const deviceName = getDeviceName();
  const payload = await callLicenseAccess({
    action: "start_trial",
    email,
    deviceId,
    deviceName,
    trialDays: 2,
    trialDurationMs: LICENSE_TRIAL_DURATION_MS,
  });
  return await persistLicenseState(payload, {
    email,
    trialEnd: Date.now() + LICENSE_TRIAL_DURATION_MS,
    deviceId,
    deviceName,
  }, requestVersion);
}

async function refreshLicenseState(session) {
  const requestVersion = beginLicenseSessionRequest(false);
  const licenseKey = String(session?.licenseKey || "").trim();
  const email = String(session?.email || "").trim().toLowerCase();
  const deviceId = await getOrCreateDeviceId();
  const deviceName = getDeviceName();
  if (!licenseKey && !email) return null;
  const payload = await callLicenseAccess({
    action: "status",
    email,
    licenseKey,
    deviceId,
    deviceName,
  });
  return await persistLicenseState(payload, { email, licenseKey, deviceId, deviceName }, requestVersion);
}

function isPlanCacheFresh(state) {
  const ts = Number(state?.cachedAt) || 0;
  return ts > 0 && Date.now() - ts < PLAN_CACHE_TTL_MS;
}

function resolvePlanLevel() {
  const plan = String(cachedPlanState?.plan || "free");
  const now = Date.now();
  const trialEnd = Number(cachedPlanState?.trialEnd) || 0;
  if (plan === "pro") return "pro";
  if (plan === "trial" && trialEnd > now) return "trial";
  return "blocked";
}

function enforcePlanForAlertSave(payload) {
  const level = resolvePlanLevel();
  if (level === "pro" || level === "trial") return { ok: true };
  return { ok: false, error: translate("plan.locked_action") };
}

function enforcePlanForMonitorStart(payload) {
  const level = resolvePlanLevel();
  if (level === "pro" || level === "trial") return { ok: true };
  return { ok: false, error: translate("plan.locked_action") };
}

function renderSleepDaysSelector(days = []) {
  const row = qs("sleepDaysRow");
  if (!row) return;
  row.innerHTML = "";
  const labels = [
    { day: 1, label: "Mon" },
    { day: 2, label: "Tue" },
    { day: 3, label: "Wed" },
    { day: 4, label: "Thu" },
    { day: 5, label: "Fri" },
    { day: 6, label: "Sat" },
    { day: 0, label: "Sun" },
  ];
  labels.forEach(({ day, label }) => {
    const wrap = document.createElement("label");
    wrap.className = "sleep-day-chip";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "sleep-day";
    input.value = String(day);
    input.checked = days.includes(day);
    const text = document.createElement("span");
    text.className = "sleep-day-label";
    text.textContent = label;
    wrap.appendChild(input);
    wrap.appendChild(text);
    row.appendChild(wrap);
  });
}

function syncSleepControlsUiState() {
  const enabled = !!qs("sleepEnabled")?.checked;
  const controls = qs("sleepControls");
  if (controls) controls.classList.toggle("disabled", !enabled);

  const ids = ["sleepStartTime", "sleepEndTime"];
  ids.forEach((id) => {
    const el = qs(id);
    if (el) el.disabled = !enabled;
  });

  qsa(".sleep-day").forEach((el) => {
    el.disabled = !enabled;
  });
}

function timePartsToString(hour, minute) {
  const hh = String(Number(hour) || 0).padStart(2, "0");
  const mm = String(Number(minute) || 0).padStart(2, "0");
  return `${hh}:${mm}`;
}

function parseTimeString(value, fallbackHour, fallbackMinute) {
  const [h, m] = String(value || "").split(":");
  const hour = Number.isFinite(Number(h)) ? Number(h) : fallbackHour;
  const minute = Number.isFinite(Number(m)) ? Number(m) : fallbackMinute;
  return { hour, minute };
}

async function loadSleepScheduleUi() {
  chrome.runtime.sendMessage({ type: "getSleepSchedule" }, (response) => {
    if (!response?.success) return;
    const schedule = response.schedule || {};
    sleepScheduleState = schedule;
    qs("sleepEnabled").checked = !!schedule.enabled;
    qs("sleepStartTime").value = timePartsToString(
      schedule.startHour,
      schedule.startMinute,
    );
    qs("sleepEndTime").value = timePartsToString(
      schedule.endHour,
      schedule.endMinute,
    );
    qs("sleepTimezone").textContent = translate("settings.timezone_label", {
      timezone:
        schedule.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone ||
        "auto",
    });
    renderSleepDaysSelector(
      Array.isArray(schedule.days) ? schedule.days : [1, 2, 3, 4, 5, 6, 0],
    );
    syncSleepControlsUiState();
  });
}

function getFilteredLeads() {
  return filterLeads(leadsHistory, {
    profileFilter: qs("leadsProfileFilter")?.value || "",
    textFilter: String(qs("leadsTextFilter")?.value || "")
      .trim()
      .toLowerCase(),
    onlySelectedGroups: !!qs("leadsOnlySelectedGroups")?.checked,
    selectedGroupIds,
  });
}

function getFacebookStatusLabel() {
  if (!isFacebookConnected) {
    return translate("status.not_logged");
  }
  if (lastFacebookUserId) {
    return `${translate("status.logged")}: ${lastFacebookUserId}`;
  }
  return translate("status.logged");
}

function setLoginStatus(ok, label = "") {
  isFacebookConnected = !!ok;
  if (!ok) lastFacebookUserId = "";
  const el = qs("loginStatus");
  const dotColor = ok ? "var(--green)" : "#ff8800";
  el.innerHTML = `<span class="status-dot" style="background:${dotColor}"></span> ${label || getFacebookStatusLabel()}`;
  const checkBtn = qs("btnCheckLoginHero");
  const hint = qs("loginHint");
  if (checkBtn) checkBtn.style.display = ok ? "none" : "inline-flex";
  if (hint) hint.classList.toggle("show", !ok);
  const footerDot = qs("fbFooterDot");
  const footerText = qs("fbFooterText");
  if (footerDot) footerDot.style.background = ok ? "var(--green)" : "#ff8800";
  if (footerText)
    footerText.textContent = ok
      ? translate("status.fb_connected")
      : translate("status.fb_disconnected");
  if (!ok && !isMonitorRunning) setOrbState("fb-disconnected");
  if (ok && !isMonitorRunning) setOrbState("idle");
}

function setOrbState(state) {
  const orb = qs("monitorOrb");
  if (!orb || !ORB_STATES.includes(state)) return;
  ORB_STATES.forEach((s) => orb.classList.remove(s));
  orb.classList.add(state);

  if (orbStateTimeout) {
    clearTimeout(orbStateTimeout);
    orbStateTimeout = null;
  }

  if (state === "lead") {
    orbStateTimeout = setTimeout(() => {
      setOrbState(isMonitorRunning ? "monitoring" : "idle");
    }, 2000);
  }
}

function setButtonLoading(id, loading) {
  const btn = qs(id);
  if (!btn) return;
  btn.disabled = !!loading;
  btn.textContent = loading ? `⏳ ${translate("status.waiting")}` : btn.dataset.label;
}

function syncHomeNextScanLabel() {
  const nextScan = qs("homeNextScanStatus");
  if (!nextScan) return;
  nextScan.textContent = translate("home.next_scan_label", {
    value: qs("monitorNextRun")?.textContent || translate("monitor.waiting"),
  });
}

const runningUiActions = new Set();

function extractUiErrorMessage(error) {
  const raw = String(error?.message || error || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return translate("common.none");
  if (/failed to fetch|networkerror|network request failed/i.test(raw)) {
    return currentLanguage === "pt-br"
      ? "Falha de conexão. Verifique a internet e tente novamente."
      : "Connection failed. Check your internet and try again.";
  }
  return raw.length > 180 ? `${raw.slice(0, 177)}...` : raw;
}

function logActionError(logId, error, key = "msg.action_failed") {
  appendLog(logId, translate(key, { error: extractUiErrorMessage(error) }), "err");
}

async function runExclusiveAction(actionKey, handler) {
  const key = String(actionKey || "").trim() || "action";
  if (runningUiActions.has(key)) return false;
  runningUiActions.add(key);
  try {
    await handler();
    return true;
  } finally {
    runningUiActions.delete(key);
  }
}

async function runButtonTask(options, handler) {
  const {
    buttonId = "",
    actionKey = buttonId || "action",
    busyText = `⏳ ${translate("common.checking")}`,
    logId = "logGeneral",
    errorKey = "msg.action_failed",
    keepDisabledAfter = false,
  } = options || {};

  return runExclusiveAction(actionKey, async () => {
    const btn = buttonId ? qs(buttonId) : null;
    if (btn) {
      if (!btn.dataset.label) btn.dataset.label = btn.textContent || "";
      btn.disabled = true;
      btn.textContent = busyText;
    }
    try {
      await handler();
    } catch (error) {
      logActionError(logId, error, errorKey);
    } finally {
      if (btn && !keepDisabledAfter) {
        btn.disabled = false;
        btn.textContent = btn.dataset.label || btn.textContent;
      }
    }
  });
}

function setGroupFetchState(running) {
  isGroupFetchRunning = running;
  qs("btnGetGroups").disabled = running;
  qs("btnStopGroups").disabled = !running;
  qs("btnGetGroups").textContent = running
    ? `⏳ ${translate("groups.fetching")}`
    : qs("btnGetGroups").dataset.label;
}

function setMonitorState(running, label) {
  isMonitorRunning = running;
  qs("btnStartMonitor").disabled = running;
  qs("btnStopMonitor").disabled = !running;
  const status = qs("monitorStatus");
  status.textContent = label || (running ? translate("status.monitoring") : translate("status.stopped"));
  status.style.color = running ? "var(--green)" : "var(--text-muted)";
  setOrbState(running ? "monitoring" : "paused");
  if (!running) {
    qs("monitorNextRun").textContent = translate("monitor.waiting");
  }
  syncHomeNextScanLabel();
  const headline = qs("systemStateHeadline");
  if (headline) {
    headline.textContent = running
      ? translate("home.machine_on")
      : translate("home.machine_off");
    headline.classList.toggle("on", running);
  }
  const toggleBtn = qs("btnMainMonitorToggle");
  if (toggleBtn) {
    toggleBtn.textContent = running
      ? translate("home.pause_monitoring")
      : translate("home.start_monitoring_main");
    toggleBtn.classList.toggle("btn-red", running);
    toggleBtn.classList.toggle("btn-green", !running);
  }
  syncHomeNextScanLabel();
  renderHomeInsights();
}

function setSleepBannerVisible(visible, message = "") {
  const banner = qs("sleepModeBanner");
  if (!banner) return;
  if (message) banner.textContent = message;
  banner.classList.toggle("show", !!visible);
}

function classifyMonitorError(rawError) {
  const text = String(rawError || "").toLowerCase();

  if (
    text.includes("nenhuma aba do facebook aberta") ||
    text.includes("sem resposta da aba do facebook") ||
    text.includes("abra uma aba em facebook.com") ||
    text.includes("facebook tab was closed")
  ) {
    return "fb_tab_missing";
  }

  if (
    text.includes("não foi possível extrair os tokens") ||
    text.includes("not logged in") ||
    text.includes("session expired") ||
    text.includes("sessão expir") ||
    text.includes("please log in")
  ) {
    return "fb_login_required";
  }

  return "generic";
}

function applyMonitorConnectionIssue(issue) {
  const kind = typeof issue === "string"
    ? classifyMonitorError(issue)
    : String(issue?.kind || "").trim() || classifyMonitorError(issue?.message || "");

  if (kind === "fb_tab_missing") {
    setLoginStatus(false, translate("status.not_logged"));
    setOrbState("fb-disconnected");
    qs("monitorStatus").textContent = translate("status.fb_tab_missing");
    qs("monitorStatus").style.color = "#ffb066";
    qs("monitorNextRun").textContent = translate("status.open_facebook_hint");
    syncHomeNextScanLabel();
    return true;
  }

  if (kind === "fb_login_required") {
    setLoginStatus(false, translate("status.not_logged"));
    setOrbState("fb-disconnected");
    qs("monitorStatus").textContent = translate("status.fb_login_required");
    qs("monitorStatus").style.color = "#ffb066";
    qs("monitorNextRun").textContent = translate("status.open_facebook_hint");
    syncHomeNextScanLabel();
    return true;
  }

  return false;
}

function updateSelectedGroupCount() {
  const selectedCount = qs("selectedGroupCount");
  if (selectedCount) {
    selectedCount.textContent =
      translate("groups.selected_count", { count: selectedGroupIds.size });
  }
  const groupCount = qs("groupCount");
  if (groupCount) {
    groupCount.textContent = translate("groups.monitored_count", {
      count: selectedGroupIds.size,
    });
  }
  const homeGroups = qs("homeGroupsMonitored");
  if (homeGroups) {
    homeGroups.textContent = translate("home.checking_groups", {
      count: selectedGroupIds.size,
    });
  }
  const summary = qs("groupsSelectionSummary");
  if (summary) {
    summary.textContent = selectedGroupIds.size
      ? translate("groups.selected_summary", {
        count: selectedGroupIds.size,
        names: getSelectedGroupNamesSummary(),
      })
      : translate("groups.select_at_least_one");
  }
}

function updateLeadsCount() {
  const count = Array.isArray(leadsHistory) ? leadsHistory.length : 0;
  qs("leadsCount").textContent = translate("leads.count_short_7d", { count });
}

function renderHomeInsights() {
  const status = qs("homeSystemStatus");
  const summary = qs("homeLeadsSummary");
  const topGroups = qs("homeTopGroups");
  const trendSvg = qs("homeTrendChart");
  const trendMeta = qs("homeTrendMeta");
  if (!status || !summary || !topGroups || !trendSvg || !trendMeta) return;

  const dotColor = isMonitorRunning ? "var(--green)" : "var(--warn)";
  status.innerHTML = `<span class="status-dot" style="background:${dotColor}"></span> ${
    isMonitorRunning ? translate("home.system_running") : translate("home.system_idle")
  }`;

  const recent = Array.isArray(leadsHistory) ? leadsHistory : [];
  summary.textContent = translate("home.leads_7d", { count: recent.length });
  const lastLead = qs("homeLastLead");
  if (lastLead) {
    const lastTs = recent
      .map((lead) => Number(lead?.detectedAt) || 0)
      .filter((v) => v > 0)
      .sort((a, b) => b - a)[0];
    if (!lastTs) {
      lastLead.textContent = translate("home.last_lead_none");
    } else {
      const diffMin = Math.max(1, Math.floor((Date.now() - lastTs) / 60000));
      const value = diffMin < 60
        ? `${diffMin}m`
        : diffMin < 1440
          ? `${Math.floor(diffMin / 60)}h`
          : `${Math.floor(diffMin / 1440)}d`;
      lastLead.textContent = translate("home.last_lead_time", { time: value });
    }
  }

  const byGroup = new Map();
  recent.forEach((lead) => {
    const name = String(lead?.group_name || "Unknown");
    byGroup.set(name, (byGroup.get(name) || 0) + 1);
  });
  const top = Array.from(byGroup.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  topGroups.innerHTML = "";
  if (!top.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = translate("home.no_group_data");
    topGroups.appendChild(empty);
  } else {
    top.forEach(([name, count], idx) => {
      const row = document.createElement("div");
      row.textContent = `${idx + 1}. ${name} — ${count}`;
      topGroups.appendChild(row);
    });
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const buckets = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - i));
    return { day, count: 0 };
  });
  recent.forEach((lead) => {
    const ts = Number(lead?.detectedAt) || 0;
    if (!ts) return;
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    const idx = buckets.findIndex((b) => b.day.getTime() === d.getTime());
    if (idx >= 0) buckets[idx].count += 1;
  });

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const w = 360;
  const h = 130;
  const padX = 18;
  const padY = 14;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const step = innerW / Math.max(1, buckets.length - 1);

  const points = buckets
    .map((b, i) => {
      const x = padX + i * step;
      const y = padY + innerH - (b.count / max) * innerH;
      return `${x},${y}`;
    })
    .join(" ");

  trendSvg.innerHTML = `
    <polyline points="${padX},${padY + innerH} ${w - padX},${padY + innerH}" stroke="var(--border)" stroke-width="1" fill="none" />
    <polyline points="${points}" stroke="var(--cyan)" stroke-width="2.5" fill="none" />
  `;

  buckets.forEach((b, i) => {
    const x = padX + i * step;
    const y = padY + innerH - (b.count / max) * innerH;
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", String(x));
    c.setAttribute("cy", String(y));
    c.setAttribute("r", "2.8");
    c.setAttribute("fill", "var(--green)");
    trendSvg.appendChild(c);
  });

  const lastLabel = buckets[buckets.length - 1];
  trendMeta.textContent = `${max} max/day • ${lastLabel.count} today`;
}

function renderGroupsLeaderboard() {
  const list = qs("groupsTopLeads");
  if (!list) return;
  list.innerHTML = "";

  const byGroup = new Map();
  leadsHistory.forEach((lead) => {
    const name = String(lead?.group_name || "").trim();
    if (!name) return;
    byGroup.set(name, (byGroup.get(name) || 0) + 1);
  });

  const topGroups = Array.from(byGroup.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (!topGroups.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = translate("groups.top_performers_empty");
    list.appendChild(empty);
    return;
  }

  topGroups.forEach(([name, count], index) => {
    const row = document.createElement("div");
    row.className = "leaderboard-row";
    row.innerHTML =
      `<div class="leaderboard-rank">${index + 1}</div>` +
      `<div class="leaderboard-name">${name}</div>` +
      `<div class="leaderboard-value">${translate("groups.top_performers_leads", { count })}</div>`;
    list.appendChild(row);
  });
}

function applyGroupsVisibilityFilter() {
  const searchTerm = String(qs("groupsSearch")?.value || "")
    .trim()
    .toLowerCase();
  const onlySelected = !!qs("groupsOnlySelected")?.checked;
  let visibleCount = 0;
  qsa("#groupsList .group-card").forEach((card) => {
    const gid = card.dataset.groupId || "";
    const group = lastLoadedGroups.get(String(gid));
    const name = String(group?.name || "").toLowerCase();
    const matchesSearch = !searchTerm || name.includes(searchTerm);
    const matchesSelected = !onlySelected || selectedGroupIds.has(String(gid));
    const visible = matchesSearch && matchesSelected;
    card.style.display = visible ? "" : "none";
    if (visible) visibleCount += 1;
  });

  const empty = qs("groupsEmptyState");
  if (empty) {
    const totalLoaded = lastLoadedGroups.size;
    if (totalLoaded === 0) {
      empty.style.display = "";
      empty.textContent = translate("groups.no_groups_hint");
    } else if (visibleCount === 0 && searchTerm) {
      empty.style.display = "";
      empty.textContent = translate("groups.no_match", { term: searchTerm });
    } else if (visibleCount === 0) {
      empty.style.display = "";
      empty.textContent = translate("groups.no_visible_filters");
    } else {
      empty.style.display = "none";
      empty.textContent = "";
    }
  }
  renderOnboardingGroupsList();
  renderGroupsLeaderboard();
}

async function loadSelectedGroupIds() {
  const data = await chrome.storage.local.get([STORAGE_SELECTED_GROUP_IDS_KEY]);
  const ids = Array.isArray(data?.[STORAGE_SELECTED_GROUP_IDS_KEY])
    ? data[STORAGE_SELECTED_GROUP_IDS_KEY]
    : [];
  selectedGroupIds = new Set(ids.map((id) => String(id)));
  updateSelectedGroupCount();
}

async function persistSelectedGroupIds() {
  await chrome.storage.local.set({
    [STORAGE_SELECTED_GROUP_IDS_KEY]: Array.from(selectedGroupIds),
  });
  updateSelectedGroupCount();
  applyGroupsVisibilityFilter();
  if (onboardingState === "groups") return;
  void refreshOnboardingStateFromContext();
}

async function persistLoadedGroups() {
  await chrome.storage.local.set({
    [STORAGE_LOADED_GROUPS_KEY]: Array.from(lastLoadedGroups.values()),
  });
}

async function loadPersistedGroups() {
  const data = await chrome.storage.local.get([STORAGE_LOADED_GROUPS_KEY]);
  const groups = Array.isArray(data?.[STORAGE_LOADED_GROUPS_KEY])
    ? data[STORAGE_LOADED_GROUPS_KEY]
    : [];
  if (!groups.length) return;

  groups.forEach((g) => {
    const key = String(g.id);
    lastLoadedGroups.set(key, g);
    upsertGroupCard(g);
  });
  const groupCount = qs("groupCount");
  if (groupCount) {
    groupCount.textContent = translate("groups.monitored_count", {
      count: selectedGroupIds.size,
    });
  }
  renderGroupsLeaderboard();
}

function fallbackAvatarDataUri() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36">` +
    `<rect width="36" height="36" fill="#e2e8f0"/>` +
    `</svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function createGroupCard(g) {
  const card = document.createElement("div");
  card.className = "group-card";
  card.dataset.groupId = String(g.id);
  card.tabIndex = 0;

  const img = document.createElement("img");
  img.src = g.image || fallbackAvatarDataUri();
  img.alt = g.name || translate("groups.title");
  img.addEventListener("error", () => {
    img.src = fallbackAvatarDataUri();
  });

  const top = document.createElement("div");
  top.className = "group-top";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = g.name || translate("common.none");

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${g.privacy || ""} · ${g.members || ""} · ID: ${g.id ?? ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "group-select";
  checkbox.checked = selectedGroupIds.has(String(g.id));
  checkbox.title = translate("groups.select_group");
  const applySelectionState = (selected) => {
    checkbox.checked = selected;
    card.classList.toggle("selected", selected);
  };
  applySelectionState(checkbox.checked);

  let toggleBusy = false;
  const toggleSelection = async () => {
    if (toggleBusy) return;
    toggleBusy = true;
    const groupId = String(g.id);
    const next = !selectedGroupIds.has(groupId);
    if (next) selectedGroupIds.add(groupId);
    else selectedGroupIds.delete(groupId);
    applySelectionState(next);
    await persistSelectedGroupIds();
    setTimeout(() => {
      toggleBusy = false;
    }, 80);
  };

  card.addEventListener("click", async () => {
    await toggleSelection();
  });
  checkbox.style.pointerEvents = "none";
  card.addEventListener("keydown", async (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    await toggleSelection();
  });
  const info = document.createElement("div");
  info.className = "info";
  info.appendChild(name);
  info.appendChild(meta);

  top.appendChild(img);
  top.appendChild(checkbox);
  card.appendChild(top);
  card.appendChild(info);

  return card;
}

function upsertGroupCard(g) {
  const key = String(g.id);
  const existing = qs("groupsList").querySelector(`[data-group-id="${key}"]`);
  if (existing) return;
  qs("groupsList").appendChild(createGroupCard(g));
}

function renderGroupsLoadingSkeleton(count = 8) {
  const list = qs("groupsList");
  list.innerHTML = "";
  for (let i = 0; i < count; i++) {
    const sk = document.createElement("div");
    sk.className = "group-card skeleton";
    sk.innerHTML =
      `<div class="group-top"><div class="thumb"></div><div class="group-select"></div></div>` +
      `<div><div class="bar"></div><div class="bar short"></div></div>`;
    list.appendChild(sk);
  }
}

function formatLeadDate(ts) {
  const date = new Date(Number(ts) || Date.now());
  return date.toLocaleString();
}

function formatLeadDateShort(ts) {
  const date = new Date(Number(ts) || Date.now());
  return date.toLocaleDateString(undefined, { day: "2-digit", month: "short" });
}

function formatLeadRelative(ts) {
  const value = Number(ts) || Date.now();
  const diffMs = Math.max(0, Date.now() - value);
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return currentLanguage === "pt-br" ? "agora" : "now";
  if (diffMin < 60) {
    return currentLanguage === "pt-br" ? `${diffMin}min atrás` : `${diffMin}m ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return currentLanguage === "pt-br" ? `${diffHours}h atrás` : `${diffHours}h ago`;
  }
  const diffDays = Math.floor(diffHours / 24);
  return currentLanguage === "pt-br" ? `${diffDays}d atrás` : `${diffDays}d ago`;
}

function firstNonEmpty(...values) {
  for (const value of values) {
    const txt = String(value || "").trim();
    if (txt) return txt;
  }
  return "";
}

const LEAD_HEADLINE_TRUNCATE_AT = 96;
const LEAD_PREVIEW_TRUNCATE_AT = 260;

function buildLink(label, href, variant = "secondary") {
  const a = document.createElement("a");
  a.textContent = label;
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.className = `lead-link-btn ${variant}`;
  return a;
}

function extractLeadTextParts(fullText) {
  const normalizedText = String(fullText || "").trim();
  if (!normalizedText) {
    return { headline: "", preview: "", fullBody: "", shouldTruncate: false };
  }
  const lines = normalizedText
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const sourceHeadline = lines[0] || normalizedText;
  const headline = sourceHeadline.length > LEAD_HEADLINE_TRUNCATE_AT
    ? `${sourceHeadline.slice(0, LEAD_HEADLINE_TRUNCATE_AT).trimEnd()}...`
    : sourceHeadline;
  const remaining = lines.slice(1).join(" ").trim();
  const fullBody = remaining || normalizedText;
  const shouldTruncate = fullBody.length > LEAD_PREVIEW_TRUNCATE_AT;
  const preview = shouldTruncate
    ? `${fullBody.slice(0, LEAD_PREVIEW_TRUNCATE_AT).trimEnd()}...`
    : fullBody;
  return { headline, preview, fullBody, shouldTruncate };
}

function buildHighlightedTextBlock(text, keyword, className) {
  const node = document.createElement("div");
  node.className = className;
  const normalizedText = String(text || "");
  const normalizedKeyword = String(keyword || "").trim();
  if (!normalizedKeyword) {
    node.textContent = normalizedText;
    return node;
  }

  const base = normalizedText.toLowerCase();
  const needle = normalizedKeyword.toLowerCase();
  const idx = base.indexOf(needle);
  if (idx < 0) {
    node.textContent = normalizedText;
    return node;
  }

  node.appendChild(document.createTextNode(normalizedText.slice(0, idx)));
  const mark = document.createElement("mark");
  mark.className = "lead-keyword-mark";
  mark.textContent = normalizedText.slice(idx, idx + normalizedKeyword.length);
  node.appendChild(mark);
  node.appendChild(
    document.createTextNode(normalizedText.slice(idx + normalizedKeyword.length)),
  );
  return node;
}

function resolveLeadMatchedKeyword(lead, leadText) {
  const profileName = String(lead?.profileName || "").trim();
  if (!profileName) return "";
  const profile = savedProfiles.find(
    (item) => String(item?.name || "").trim() === profileName,
  );
  if (!profile) return "";
  const normalizedLeadText = normalizeGuidedText(leadText);
  const keywords = Array.isArray(profile.positiveKeywords)
    ? profile.positiveKeywords
    : [];
  for (const keyword of keywords) {
    const raw = String(keyword || "").trim();
    if (!raw) continue;
    if (normalizedLeadText.includes(normalizeGuidedText(raw))) {
      return raw;
    }
  }
  return "";
}

function buildLeadTextBlock(fullText, matchedKeyword) {
  const wrap = document.createElement("div");
  wrap.className = "lead-text-wrap";

  const { headline, preview, fullBody, shouldTruncate } = extractLeadTextParts(fullText);
  const headlineNode = buildHighlightedTextBlock(headline, matchedKeyword, "lead-text-headline");
  wrap.appendChild(headlineNode);

  let currentBodyNode = buildHighlightedTextBlock(preview, matchedKeyword, "lead-text");
  wrap.appendChild(currentBodyNode);

  if (!shouldTruncate) {
    return wrap;
  }

  let expanded = false;
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "linklike lead-toggle";
  toggle.textContent = translate("leads.show_more");
  toggle.addEventListener("click", () => {
    expanded = !expanded;
    const nextBodyNode = buildHighlightedTextBlock(
      expanded ? fullBody : preview,
      matchedKeyword,
      "lead-text",
    );
    currentBodyNode.replaceWith(nextBodyNode);
    currentBodyNode = nextBodyNode;
    toggle.textContent = expanded
      ? translate("leads.show_less")
      : translate("leads.show_more");
  });
  wrap.appendChild(toggle);
  return wrap;
}

function renderLeads() {
  const list = qs("leadsList");
  list.innerHTML = "";
  const filtered = getFilteredLeads();

  qs("leadsCount").textContent = translate("leads.count_short_7d", {
    count: filtered.length,
  });

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = translate("leads.empty_7d");
    list.appendChild(empty);
    return;
  }

  filtered.forEach((lead) => {
    const card = document.createElement("div");
    card.className = "lead-card";

    const groupRow = document.createElement("div");
    groupRow.className = "lead-group";
    groupRow.textContent = lead.group_name || translate("groups.title");

    const meta = document.createElement("div");
    meta.className = "lead-meta";
    const leadDate = `${formatLeadDateShort(lead.detectedAt)} • ${formatLeadRelative(
      lead.detectedAt,
    )}`;
    meta.textContent = lead.poster_name
      ? `${leadDate}${translate("leads.by_author", { name: lead.poster_name })}`
      : leadDate;

    const leadText = firstNonEmpty(
      lead.post_text,
      lead.marketplace_text,
      translate("leads.no_text"),
    );
    const matchedKeyword = resolveLeadMatchedKeyword(lead, leadText);
    const textBlock = buildLeadTextBlock(leadText, matchedKeyword);

    const detected = document.createElement("div");
    detected.className = "lead-detected";
    if (matchedKeyword) {
      detected.textContent = translate("leads.detected", { keyword: matchedKeyword });
    } else if (lead.profileName) {
      detected.textContent = translate("leads.alert_name", {
        profile: lead.profileName,
      });
    } else {
      detected.style.display = "none";
    }

    const links = document.createElement("div");
    links.className = "lead-links";
    if (lead.post_url)
      links.appendChild(
        buildLink(translate("leads.open_post"), lead.post_url, "post-primary"),
      );
    if (lead.user_profile_url) {
      links.appendChild(
        buildLink(translate("leads.link_person_short"), lead.user_profile_url, "secondary"),
      );
    }
    if (lead.group_url)
      links.appendChild(
        buildLink(translate("leads.link_group_short"), lead.group_url, "secondary"),
      );

    card.appendChild(groupRow);
    card.appendChild(meta);
    card.appendChild(textBlock);
    card.appendChild(detected);
    card.appendChild(links);
    list.appendChild(card);
  });
}

async function refreshLeadsHistory() {
  chrome.runtime.sendMessage({ type: "getLeadHistory" }, (response) => {
    if (!response?.success) {
      appendLog(
        "logPosts",
        `❌ Falha ao carregar histórico: ${response?.error}`,
        "err",
      );
      return;
    }
    leadsHistory = Array.isArray(response.leads) ? response.leads : [];
    const profileSelect = qs("leadsProfileFilter");
    if (profileSelect) {
      const previous = profileSelect.value;
      const profileNames = Array.from(
        new Set(
          leadsHistory
            .map((lead) => String(lead.profileName || "").trim())
            .filter(Boolean),
        ),
      );
      profileSelect.innerHTML = `<option value="">${translate("leads.all_alerts")}</option>`;
      profileNames.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        profileSelect.appendChild(opt);
      });
      profileSelect.value = profileNames.includes(previous) ? previous : "";
    }
    renderLeads();
    renderHomeInsights();
    renderGroupsLeaderboard();
  });
}

function parseKeywordsInput(value) {
  return String(value || "")
    .split(/[\n,]/g)
    .map((v) => v.trim())
    .filter(Boolean);
}

function renderKeywordPreview(targetId, keywords, kind) {
  const container = qs(targetId);
  if (!container) return;
  container.innerHTML = "";
  if (!keywords.length) {
    const empty = document.createElement("div");
    empty.className = "kw-empty";
    empty.textContent = translate("common.none");
    container.appendChild(empty);
    return;
  }
  keywords.forEach((kw) => {
    const chip = document.createElement("span");
    chip.className = `kw-chip ${kind}`;
    chip.textContent = kw;
    container.appendChild(chip);
  });
}

function updateProfileKeywordPreview() {
  const pos = parseKeywordsInput(qs("profileEditorPositive").value);
  const neg = parseKeywordsInput(qs("profileEditorNegative").value);
  renderKeywordPreview("profilePreviewPos", pos, "pos");
  renderKeywordPreview("profilePreviewNeg", neg, "neg");
  updateProfileSummaryCard();
}

function updateMonitorProfilePreview() {
  const profile = getProfileById(selectedProfileId);
  const pos = profile?.positiveKeywords || [];
  const neg = profile?.negativeKeywords || [];
  renderKeywordPreview("monitorPreviewPos", pos, "pos");
  renderKeywordPreview("monitorPreviewNeg", neg, "neg");
}

function buildMonitorConfigFromUi() {
  const selected = getProfileById(selectedProfileId);
  return {
    profileName: selected?.name || "",
    positiveKeywords: selected?.positiveKeywords || [],
    negativeKeywords: selected?.negativeKeywords || [],
    minMinutes: Number(globalMonitorFrequency?.min) || 5,
    maxMinutes: Number(globalMonitorFrequency?.max) || 10,
    selectedProfileId: selectedProfileId || "",
  };
}

async function persistMonitorConfigFromUi() {
  const config = buildMonitorConfigFromUi();
  await chrome.storage.local.set({ [STORAGE_MONITOR_CONFIG_KEY]: config });
}

async function loadMonitorConfigToUi() {
  const data = await chrome.storage.local.get([STORAGE_MONITOR_CONFIG_KEY]);
  const config = data?.[STORAGE_MONITOR_CONFIG_KEY] || {};
  selectedProfileId = config.selectedProfileId || "";
}

async function fetchFacebookSettingsHtml() {
  const res = await fetch("https://www.facebook.com/settings", {
    method: "GET",
    credentials: "include",
  });
  return await res.text();
}

function setupTabs() {
  qsa(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activateTab(btn.dataset.tab);
    });
  });
}

function setupSidebarTooltips() {
  const tooltip = qs("sidebarTooltip");
  if (!tooltip) return;

  let showTimer = null;
  let activeButton = null;

  const hide = () => {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    tooltip.classList.remove("show");
    activeButton = null;
  };

  qsa(".tab-btn").forEach((btn) => {
    const text = btn.textContent?.trim() || "";

    btn.addEventListener("mouseenter", () => {
      if (window.innerWidth > 480) return;
      if (showTimer) clearTimeout(showTimer);
      activeButton = btn;
      showTimer = setTimeout(() => {
        if (!activeButton) return;
        const rect = activeButton.getBoundingClientRect();
        tooltip.textContent = text;
        tooltip.style.left = `${Math.round(rect.right + 8)}px`;
        tooltip.style.top = `${Math.round(rect.top + rect.height / 2 - 14)}px`;
        tooltip.classList.add("show");
      }, 300);
    });

    btn.addEventListener("mouseleave", hide);
    btn.addEventListener("click", hide);
  });

  window.addEventListener("resize", hide);
  window.addEventListener("scroll", hide, { passive: true });
}

function setupOnboardingWorkspaceActions() {
  const loadBtn = qs("btnOnboardLoadGroups");
  const selectBtn = qs("btnOnboardSelectVisible");
  const clearBtn = qs("btnOnboardClearGroups");
  const saveAlertBtn = qs("btnOnboardSaveAlert");
  const searchInput = qs("onboardGroupsSearch");

  if (loadBtn) {
    loadBtn.addEventListener("click", () => {
      qs("btnGetGroups").click();
    });
  }
  if (selectBtn) {
    selectBtn.addEventListener("click", () => {
      void runButtonTask(
        { buttonId: "btnOnboardSelectVisible", actionKey: "onboardSelectVisible" },
        async () => {
          const search = String(searchInput?.value || "")
            .trim()
            .toLowerCase();
          for (const g of lastLoadedGroups.values()) {
            const matches =
              !search || String(g?.name || "").toLowerCase().includes(search);
            if (matches) selectedGroupIds.add(String(g.id));
          }
          await persistSelectedGroupIds();
          renderOnboardingGroupsList();
        },
      );
    });
  }
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      void runButtonTask(
        { buttonId: "btnOnboardClearGroups", actionKey: "onboardClearGroups" },
        async () => {
          selectedGroupIds.clear();
          await persistSelectedGroupIds();
          renderOnboardingGroupsList();
        },
      );
    });
  }
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderOnboardingGroupsList();
    });
  }

  const watchInput = qs("onboardWatchInput");
  const excludeInput = qs("onboardExcludeInput");

  const bindKeywordInput = (inputEl, kind) => {
    if (!inputEl) return;
    const commit = () => {
      const value = String(inputEl.value || "").trim();
      if (!value) return;
      addOnboardKeyword(kind, value);
      inputEl.value = "";
    };
    inputEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        commit();
      }
    });
    inputEl.addEventListener("blur", commit);
  };

  bindKeywordInput(watchInput, "watch");
  bindKeywordInput(excludeInput, "exclude");

  qsa(".onboard-watch-suggestion").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      addOnboardKeyword("watch", btn.dataset.value || "");
    });
  });

  qsa(".onboard-exclude-suggestion").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      addOnboardKeyword("exclude", btn.dataset.value || "");
    });
  });

  if (saveAlertBtn) {
    saveAlertBtn.addEventListener("click", () => {
      void runButtonTask(
        {
          buttonId: "btnOnboardSaveAlert",
          actionKey: "onboardSaveAlert",
          logId: "logGeneral",
        },
        async () => {
          await saveOnboardingAlert();
        },
      );
    });
  }

  qs("btnOpenSettingsFrequency")?.addEventListener("click", () => {
    activateTab("settings");
    qs("globalFrequencySelect")?.focus();
  });

  const guidedInput = qs("guidedPromptInput");
  if (guidedInput) {
    guidedInput.addEventListener("input", () => {
      renderAgentActionsByQuery(guidedInput.value);
    });
    guidedInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        const first = getFilteredGuidedActions(guidedInput.value)[0];
        if (first) runGuidedAction(first);
        return;
      }
      if (event.key === "ArrowUp") {
        if (!guidedCommandHistory.length) return;
        event.preventDefault();
        guidedHistoryCursor = Math.min(
          guidedCommandHistory.length - 1,
          guidedHistoryCursor + 1,
        );
        guidedInput.value = guidedCommandHistory[guidedHistoryCursor] || "";
        renderAgentActionsByQuery(guidedInput.value);
        return;
      }
      if (event.key === "ArrowDown") {
        if (!guidedCommandHistory.length) return;
        event.preventDefault();
        guidedHistoryCursor = Math.max(-1, guidedHistoryCursor - 1);
        guidedInput.value =
          guidedHistoryCursor === -1
            ? ""
            : guidedCommandHistory[guidedHistoryCursor] || "";
        renderAgentActionsByQuery(guidedInput.value);
      }
    });
  }
}

function getProfileById(id) {
  return savedProfiles.find((p) => p.id === id);
}

async function persistProfiles() {
  await chrome.storage.local.set({ [STORAGE_PROFILES_KEY]: savedProfiles });
}

function profileKeywordsSummary(profile) {
  const pos = (profile.positiveKeywords || []).length;
  const neg = (profile.negativeKeywords || []).length;
  return `${pos} ${translate("kw.watch_for").toLowerCase()} · ${neg} ${translate("kw.exclude_words").toLowerCase()}`;
}

function buildProfileKeywordChip(value, type) {
  const chip = document.createElement("span");
  chip.className = `profile-chip ${type}`;
  chip.textContent = value;
  return chip;
}

function buildProfileKeywordList(values, type, emptyText) {
  const wrap = document.createElement("div");
  wrap.className = "profile-keyword-list";
  const normalized = Array.isArray(values)
    ? values.map((value) => String(value || "").trim()).filter(Boolean)
    : [];

  if (!normalized.length) {
    wrap.appendChild(buildProfileKeywordChip(emptyText, "empty"));
    return wrap;
  }

  normalized.forEach((value) => {
    wrap.appendChild(buildProfileKeywordChip(value, type));
  });
  return wrap;
}

function setProfileBuilderOpen(open) {
  isProfileBuilderOpen = !!open;
  const card = qs("profileBuilderCard");
  if (!card) return;
  card.style.display = isProfileBuilderOpen ? "" : "none";
}

function appendKeywordToEditor(targetId, value) {
  if (targetId === "profileEditorPositive") {
    addProfileKeyword("watch", value);
    return;
  }
  if (targetId === "profileEditorNegative") {
    addProfileKeyword("exclude", value);
    return;
  }
  const el = qs(targetId);
  if (!el) return;
  const current = String(el.value || "").trim();
  const next = current ? `${current}, ${value}` : value;
  el.value = next;
  updateProfileKeywordPreview();
}

function getWizardStepIndex(step) {
  const idx = PROFILE_WIZARD_STEPS.indexOf(step);
  return idx >= 0 ? idx : 0;
}

function updateProfileNameCounter() {
  const input = qs("profileEditorName");
  const counter = qs("profileNameCounter");
  if (!input || !counter) return;
  const size = String(input.value || "").length;
  counter.textContent = `${size}/40`;
}

function updateFrequencyCardSelection(min, max) {
  qsa(".freq-card").forEach((card) => {
    const cardMin = Number(card.dataset.min) || 0;
    const cardMax = Number(card.dataset.max) || 0;
    card.classList.toggle("active", cardMin === min && cardMax === max);
  });
}

function getWizardLocaleCopy() {
  const pt = currentLanguage === "pt-br";
  return {
    stepLabel: pt ? "Etapa {current} de {total}" : "Step {current} of {total}",
    questions: {
      name: pt
        ? "Como você quer chamar este alerta?"
        : "What do you want to call this alert?",
      watch: pt
        ? "Quais palavras alguém usaria quando precisa do que você oferece?"
        : "What words would someone use when they need what you offer?",
      exclude: pt
        ? "Tem palavras que significam que NÃO é lead?"
        : "Any words that mean it is NOT a lead?",
      summary: pt ? "Aqui está seu alerta." : "Here is your alert summary.",
    },
    hints: {
      name: pt
        ? "Máximo 40 caracteres."
        : "Maximum 40 characters.",
      watch: pt
        ? "Inclua palavras que definem a intenção do lead."
        : "Add words that represent real buyer intent.",
      exclude: pt
        ? "Use exclusões para reduzir ruído."
        : "Use exclude words to reduce noise.",
      summary: pt
        ? "Revise antes de iniciar."
        : "Review before starting.",
    },
    btnBack: pt ? "Voltar" : "Back",
    btnNext: pt ? "Próximo" : "Next",
    btnSave: translate("btn.create_alert"),
    btnUpdate: translate("btn.save_changes"),
    btnStart: pt ? "Iniciar monitoramento" : "Start monitoring",
    freeFrequencyLock: pt
      ? "Plano Free permite apenas 15-20 min."
      : "Free plan only allows 15-20 min.",
  };
}

function applyWizardPlanLocks() {
  const level = resolvePlanLevel();
  const isBlocked = level === "blocked";

  qsa(".freq-card").forEach((card) => {
    const proOnly = card.dataset.proOnly === "1";
    card.classList.toggle("locked", isBlocked && proOnly);
    const title = card.querySelector(".title");
    if (!title) return;
    const existing = title.querySelector(".lock-badge");
    if (existing) existing.remove();
    if (isBlocked && proOnly) {
      const badge = document.createElement("span");
      badge.className = "lock-badge";
      badge.textContent = translate("btn.upgrade");
      title.appendChild(badge);
    }
  });

  const notifyWebhookWrap = qs("notifyWebhookWrap");
  const notifyTelegramWrap = qs("notifyTelegramWrap");
  if (notifyWebhookWrap) notifyWebhookWrap.classList.remove("locked");
  if (notifyTelegramWrap) notifyTelegramWrap.classList.remove("locked");
}

function updateProfileSummaryCard() {
  const box = qs("profileSummaryCard");
  if (!box) return;
  const name = String(qs("profileEditorName")?.value || "").trim() || "(unnamed)";
  const watch = parseKeywordsInput(qs("profileEditorPositive")?.value || "");
  const exclude = parseKeywordsInput(qs("profileEditorNegative")?.value || "");

  box.innerHTML =
    `<div><strong>${translate("profiles.name_label")}:</strong> ${name}</div>` +
    `<div><strong>${translate("groups.title")}:</strong> ${selectedGroupIds.size}</div>` +
    `<div><strong>${translate("kw.watch_for")}:</strong> ${watch.join(", ") || translate("profiles.all_posts")}</div>` +
    `<div><strong>${translate("kw.exclude_words")}:</strong> ${exclude.join(", ") || translate("common.none")}</div>` +
    `<div><strong>${translate("settings.frequency_title")} / ${translate("settings.notifications_title")}:</strong> ${translate("profiles.configured_in_settings")}</div>`;
}

function getDefaultFrequencyForPlan() {
  const level = resolvePlanLevel();
  if (level === "blocked") return { min: 15, max: 20 };
  return { min: 3, max: 8 };
}

function frequencyPairFromString(value) {
  const [minRaw, maxRaw] = String(value || "").split("-");
  const min = Number(minRaw) || 3;
  const max = Number(maxRaw) || 8;
  return { min, max };
}

function frequencyPairToString(min, max) {
  return `${Number(min) || 3}-${Number(max) || 8}`;
}

async function loadGlobalMonitorFrequency() {
  const data = await chrome.storage.local.get([STORAGE_GLOBAL_FREQUENCY_KEY]);
  const saved = data?.[STORAGE_GLOBAL_FREQUENCY_KEY];
  if (saved && typeof saved === "object") {
    globalMonitorFrequency = {
      min: Number(saved.min) || 3,
      max: Number(saved.max) || 8,
    };
  } else {
    globalMonitorFrequency = getDefaultFrequencyForPlan();
    await chrome.storage.local.set({
      [STORAGE_GLOBAL_FREQUENCY_KEY]: globalMonitorFrequency,
    });
  }
  renderGlobalFrequencyUi();
}

async function persistGlobalMonitorFrequency(next) {
  globalMonitorFrequency = {
    min: Number(next?.min) || 3,
    max: Number(next?.max) || 8,
  };
  await chrome.storage.local.set({
    [STORAGE_GLOBAL_FREQUENCY_KEY]: globalMonitorFrequency,
  });
  renderGlobalFrequencyUi();
}

function renderGlobalFrequencyUi() {
  const cards = qsa(".settings-freq-card");
  const hint = qs("globalFrequencyHint");
  if (!cards.length || !hint) return;

  const level = resolvePlanLevel();
  const isBlocked = level === "blocked";
  cards.forEach((card) => {
    const min = Number(card.dataset.min) || 0;
    const max = Number(card.dataset.max) || 0;
    const proOnly = card.dataset.proOnly === "1";
    card.classList.toggle("locked", isBlocked && proOnly);
    card.classList.toggle(
      "active",
      min === globalMonitorFrequency.min && max === globalMonitorFrequency.max,
    );
  });

  if (isBlocked && globalMonitorFrequency.min < 15) {
    globalMonitorFrequency = { min: 15, max: 20 };
    cards.forEach((card) => {
      const min = Number(card.dataset.min) || 0;
      const max = Number(card.dataset.max) || 0;
      card.classList.toggle("active", min === 15 && max === 20);
    });
  }

  hint.textContent = translate("settings.frequency_current", {
    min: globalMonitorFrequency.min,
    max: globalMonitorFrequency.max,
  });
  hint.classList.remove("risk-safe", "risk-mid", "risk-high", "risk-danger");
  if (globalMonitorFrequency.min >= 15) {
    hint.classList.add("risk-safe");
  } else if (globalMonitorFrequency.min >= 5) {
    hint.classList.add("risk-mid");
  } else if (globalMonitorFrequency.min >= 3) {
    hint.classList.add("risk-high");
  } else {
    hint.classList.add("risk-danger");
  }
  if (qs("profileEditorMin")) qs("profileEditorMin").value = String(globalMonitorFrequency.min);
  if (qs("profileEditorMax")) qs("profileEditorMax").value = String(globalMonitorFrequency.max);
  onboardAlertFrequency = {
    min: globalMonitorFrequency.min,
    max: globalMonitorFrequency.max,
  };
  const onboardFreqText = qs("onboardAlertFreqText");
  if (onboardFreqText) {
    onboardFreqText.textContent = translate("settings.frequency_current", {
      min: globalMonitorFrequency.min,
      max: globalMonitorFrequency.max,
    });
  }
}

function readNotificationSettingsFromUi() {
  return {
    notifyBrowser: !!qs("notifyBrowser")?.checked,
    notifyWebhook: !!qs("notifyWebhook")?.checked,
    notifyTelegram: !!qs("notifyTelegram")?.checked,
    webhookUrl: String(qs("notifyWebhookUrl")?.value || "").trim(),
    telegramChatId: String(qs("telegramChatId")?.value || "").trim(),
  };
}

function applyNotificationSettingsToUi(settings) {
  if (qs("notifyBrowser")) qs("notifyBrowser").checked = !!settings.notifyBrowser;
  if (qs("notifyWebhook")) qs("notifyWebhook").checked = !!settings.notifyWebhook;
  if (qs("notifyTelegram")) qs("notifyTelegram").checked = !!settings.notifyTelegram;
  if (qs("notifyWebhookUrl")) qs("notifyWebhookUrl").value = settings.webhookUrl || "";
  if (qs("telegramChatId")) qs("telegramChatId").value = settings.telegramChatId || "";
}

async function loadNotificationSettings() {
  const data = await chrome.storage.local.get([STORAGE_NOTIFICATION_SETTINGS_KEY]);
  const saved = data?.[STORAGE_NOTIFICATION_SETTINGS_KEY];
  if (saved && typeof saved === "object") {
    notificationSettings = {
      ...notificationSettings,
      ...saved,
    };
  }
  applyNotificationSettingsToUi(notificationSettings);
}

async function persistNotificationSettings() {
  let next = mergeNotificationSettings(
    notificationSettings,
    readNotificationSettingsFromUi(),
  );
  if (next.notifyWebhook && next.webhookUrl) {
    const granted = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: "checkWebhookPermission", webhookUrl: next.webhookUrl },
        (response) => resolve(!!response?.granted),
      );
    });
    const result = applyWebhookPermissionResult(next, granted);
    next = result.settings;
    if (result.permissionDenied) {
      appendLog("logGeneral", "Webhook permission denied.", "err");
      if (qs("notifyWebhook")) qs("notifyWebhook").checked = false;
    }
  }

  notificationSettings = next;
  await chrome.storage.local.set({
    [STORAGE_NOTIFICATION_SETTINGS_KEY]: notificationSettings,
  });
  appendLog("logGeneral", translate("settings.save_notifications"), "ok");
}

function buildTestLeadPayload() {
  return {
    alert_name: "Test alert",
    lead_name: "Jane Doe",
    group: "B2B Entrepreneurs",
    post_text: "Anyone recommend a photographer for an event?",
    post_url: "https://www.facebook.com/",
    matched_keywords: ["recommend", "photographer"],
    detected_at: new Date().toISOString(),
  };
}

function renderProfileWizard() {
  const copy = getWizardLocaleCopy();
  const step = currentProfileWizardStep;
  const idx = getWizardStepIndex(step) + 1;
  const total = PROFILE_WIZARD_STEPS.length;
  const pill = qs("profileWizardPill");
  const question = qs("profileWizardQuestion");
  const hint = qs("profileWizardHint");
  const btnPrev = qs("btnProfilePrevStep");
  const btnNext = qs("btnProfileNextStep");
  const btnSave = qs("btnSaveProfile");
  const btnStart = qs("btnProfileStartMonitoring");

  if (pill) {
    pill.textContent = copy.stepLabel
      .replace("{current}", String(idx))
      .replace("{total}", String(total));
  }

  if (question) question.textContent = translate("profiles.builder_simple_title");
  if (hint) hint.textContent = translate("profiles.builder_simple_hint");

  const stepMap = {
    name: "profileStepName",
    watch: "profileStepWatch",
    exclude: "profileStepExclude",
    summary: "profileStepSummary",
  };
  Object.entries(stepMap).forEach(([name, id]) => {
    const el = qs(id);
    if (!el) return;
    if (name === "name" || name === "watch" || name === "exclude") {
      el.classList.add("active");
      return;
    }
    el.classList.toggle("active", name === step);
  });

  if (btnPrev) btnPrev.style.display = idx === 1 ? "none" : "";
  if (btnNext) btnNext.style.display = step === "summary" ? "none" : "";
  if (btnSave) btnSave.style.display = step === "summary" ? "" : "none";
  if (btnStart) btnStart.style.display = step === "summary" ? "" : "none";
  if (btnPrev) btnPrev.textContent = copy.btnBack;
  if (btnNext) btnNext.textContent = copy.btnNext;
  if (btnSave) btnSave.textContent = selectedProfileId ? copy.btnUpdate : copy.btnSave;
  if (btnStart) btnStart.textContent = copy.btnStart;

  updateProfileNameCounter();
  updateProfileSummaryCard();
  applyWizardPlanLocks();
}

function goProfileWizardStep(delta) {
  const current = getWizardStepIndex(currentProfileWizardStep);
  const target = Math.max(
    0,
    Math.min(PROFILE_WIZARD_STEPS.length - 1, current + delta),
  );
  currentProfileWizardStep = PROFILE_WIZARD_STEPS[target];
  renderProfileWizard();
}

function validateCurrentProfileWizardStep() {
  if (currentProfileWizardStep === "name") {
    const name = String(qs("profileEditorName")?.value || "").trim();
    if (!name) {
      appendLog("logGeneral", translate("profiles.name_required"), "warn");
      return false;
    }
    if (name.length > 40) {
      appendLog("logGeneral", translate("profiles.name_max_40"), "warn");
      return false;
    }
  }

  if (currentProfileWizardStep === "watch") {
    // Watch keywords are optional: empty means monitor all posts.
  }

  return true;
}

function renderProfiles() {
  const list = qs("profilesList");
  list.innerHTML = "";

  if (!savedProfiles.length) {
    list.innerHTML = `<div class="muted">${translate("profiles.none_saved")}</div>`;
    setProfileBuilderOpen(true);
  } else {
    setProfileBuilderOpen(isProfileBuilderOpen);
    savedProfiles.forEach((profile) => {
      const watchList = Array.isArray(profile.positiveKeywords)
        ? profile.positiveKeywords
        : [];
      const excludeList = Array.isArray(profile.negativeKeywords)
        ? profile.negativeKeywords
        : [];
      const item = document.createElement("details");
      item.className = `profile-item ${profile.id === selectedProfileId ? "active" : ""}`;
      item.open = profile.id === selectedProfileId;
      item.innerHTML =
        `<summary>` +
        `<div class="profile-item-head">` +
        `<div class="profile-item-summary">` +
        `<div class="title">${profile.name}</div>` +
        `<div class="meta">${profileKeywordsSummary(profile)}</div>` +
        `</div>` +
        `</div>` +
        `</summary>`;

      const body = document.createElement("div");
      body.className = "profile-item-body";

      const watchBlock = document.createElement("div");
      watchBlock.className = "profile-keyword-block";
      watchBlock.innerHTML = `<div class="profile-keyword-label">${translate("kw.watch_for")}</div>`;
      watchBlock.appendChild(
        buildProfileKeywordList(watchList, "watch", translate("profiles.all_posts")),
      );

      const excludeBlock = document.createElement("div");
      excludeBlock.className = "profile-keyword-block";
      excludeBlock.innerHTML = `<div class="profile-keyword-label">${translate("kw.exclude_words")}</div>`;
      excludeBlock.appendChild(
        buildProfileKeywordList(excludeList, "exclude", translate("common.none")),
      );

      const footer = document.createElement("div");
      footer.className = "profile-card-footer";
      footer.innerHTML =
        `<div class="meta">${translate("groups.selected_count", { count: selectedGroupIds.size })}</div>` +
        `<div class="profile-item-actions">` +
        `<button class="btn btn-gray" type="button" data-action="edit">${translate("btn.edit")}</button>` +
        `<button class="btn btn-red" type="button" data-action="delete">${translate("btn.delete")}</button>` +
        `</div>`;

      body.appendChild(watchBlock);
      body.appendChild(excludeBlock);
      body.appendChild(footer);
      item.appendChild(body);
      item.querySelector('[data-action="edit"]')?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setProfileBuilderOpen(true);
        selectProfile(profile.id, true);
      });
      item.querySelector('[data-action="delete"]')?.addEventListener("click", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        await deleteProfileById(profile.id);
      });
      item.querySelector("summary")?.addEventListener("click", (event) => {
        event.preventDefault();
        setProfileBuilderOpen(true);
        selectProfile(profile.id, true);
      });
      list.appendChild(item);
    });
  }

  const select = qs("monitorProfileSelect");
  const activeProfileId =
    selectedProfileId && getProfileById(selectedProfileId)
      ? selectedProfileId
      : (savedProfiles[0]?.id ? String(savedProfiles[0].id) : "");
  if (select) {
    select.innerHTML = `<option value="">${translate("monitor.select_alert")}</option>`;
    savedProfiles.forEach((profile) => {
      const opt = document.createElement("option");
      opt.value = profile.id;
      opt.textContent = profile.name;
      select.appendChild(opt);
    });
    select.value = activeProfileId;
    select.disabled = savedProfiles.length === 0;
  }

  const badge = qs("activeProfileBadge");
  const selected = getProfileById(selectedProfileId);
  badge.textContent = selected
    ? `${translate("profiles.active_label")}: ${selected.name}`
    : translate("profiles.none_selected");
  renderLeads();
  renderProfileWizard();
}

function selectProfile(profileId, syncMonitorFields) {
  selectedProfileId = profileId || "";
  const profile = getProfileById(selectedProfileId);
  setProfileBuilderOpen(true);

  if (profile) {
    qs("profileEditorName").value = profile.name;
    qs("profileEditorPositive").value = (profile.positiveKeywords || []).join(
      ", ",
    );
    qs("profileEditorNegative").value = (profile.negativeKeywords || []).join(
      ", ",
    );
    qs("profileEditorMin").value = String(globalMonitorFrequency.min);
    qs("profileEditorMax").value = String(globalMonitorFrequency.max);
    updateFrequencyCardSelection(
      Number(globalMonitorFrequency.min) || 5,
      Number(globalMonitorFrequency.max) || 10,
    );

    if (syncMonitorFields) void persistMonitorConfigFromUi();
  } else {
    qs("profileEditorMin").value = String(globalMonitorFrequency.min);
    qs("profileEditorMax").value = String(globalMonitorFrequency.max);
    updateFrequencyCardSelection(globalMonitorFrequency.min, globalMonitorFrequency.max);
  }

  syncProfileEditorChipsFromFields();
  renderProfiles();
  updateMonitorProfilePreview();
  updateProfileKeywordPreview();
  updateProfileSummaryCard();
  void refreshOnboardingStateFromContext();
}

function resetProfileEditorDraft() {
  selectedProfileId = "";
  qs("profileEditorName").value = "";
  qs("profileEditorPositive").value = "";
  qs("profileEditorNegative").value = "";
  if (qs("profileWatchInput")) qs("profileWatchInput").value = "";
  if (qs("profileExcludeInput")) qs("profileExcludeInput").value = "";
  qs("profileAdvancedBlock")?.removeAttribute("open");
  qs("profileEditorMin").value = String(globalMonitorFrequency.min);
  qs("profileEditorMax").value = String(globalMonitorFrequency.max);
  updateFrequencyCardSelection(globalMonitorFrequency.min, globalMonitorFrequency.max);
  syncProfileEditorChipsFromFields();
}

async function deleteProfileById(profileId) {
  const targetId = String(profileId || "").trim();
  if (!targetId) {
    appendLog("logGeneral", translate("profiles.select_to_delete"), "warn");
    return;
  }

  savedProfiles = savedProfiles.filter((p) => p.id !== targetId);
  const wasSelected = selectedProfileId === targetId;
  if (wasSelected) {
    resetProfileEditorDraft();
  }

  await persistProfiles();
  renderProfiles();
  updateMonitorProfilePreview();
  updateProfileKeywordPreview();
  await persistMonitorConfigFromUi();
  appendLog("logGeneral", translate("profiles.removed"), "warn");
  await refreshOnboardingStateFromContext();
}

async function loadProfiles() {
  const data = await chrome.storage.local.get([STORAGE_PROFILES_KEY]);
  savedProfiles = Array.isArray(data?.[STORAGE_PROFILES_KEY])
    ? data[STORAGE_PROFILES_KEY]
    : [];
  isProfileBuilderOpen = savedProfiles.length === 0;
  renderProfiles();
}

async function saveProfileFromEditor() {
  const name = qs("profileEditorName").value.trim();
  if (!name) {
    appendLog("logGeneral", translate("profiles.name_required"), "warn");
    return false;
  }
  if (name.length > 40) {
    appendLog("logGeneral", translate("profiles.name_max_40"), "warn");
    return false;
  }
  const genericNames = new Set(["test", "aaa"]);
  if (genericNames.has(name.toLowerCase())) {
    appendLog("logGeneral", translate("profiles.hint_descriptive"), "info");
  }

  const positiveKeywords = parseKeywordsInput(
    qs("profileEditorPositive").value,
  );
  const negativeKeywords = parseKeywordsInput(
    qs("profileEditorNegative").value,
  );
  const minMinutes = Number(globalMonitorFrequency.min) || 5;
  const maxMinutes = Number(globalMonitorFrequency.max) || 10;
  qs("profileEditorMin").value = String(minMinutes);
  qs("profileEditorMax").value = String(maxMinutes);

  const planCheck = enforcePlanForAlertSave({
    positiveKeywords,
    negativeKeywords,
    minMinutes,
    maxMinutes,
  });
  if (!planCheck.ok) {
    appendLog("logGeneral", planCheck.error, "warn");
    return false;
  }

  const next = upsertProfile({
    savedProfiles,
    selectedProfileId,
    draft: {
      name,
      positiveKeywords,
      negativeKeywords,
      minMinutes,
      maxMinutes,
    },
  });
  savedProfiles = next.savedProfiles;
  selectedProfileId = next.selectedProfileId;
  if (next.duplicateName) {
    appendLog(
      "logGeneral",
      translate("profiles.duplicate_overwrite", { name: next.duplicateName }),
      "warn",
    );
  }

  await persistProfiles();
  selectProfile(selectedProfileId, true);
  appendLog("logGeneral", translate("profiles.saved_ok"), "ok");
  await refreshOnboardingStateFromContext();
  updateProfileSummaryCard();
  return true;
}

function setupProfileActions() {
  qs("btnNewProfile")?.addEventListener("click", () => {
    resetProfileEditorDraft();
    setProfileBuilderOpen(true);
    currentProfileWizardStep = "name";
    renderProfiles();
    updateMonitorProfilePreview();
    updateProfileKeywordPreview();
    renderProfileWizard();
  });

  qs("btnCreateNewAlertGlobal")?.addEventListener("click", () => {
    resetProfileEditorDraft();
    setProfileBuilderOpen(true);
    currentProfileWizardStep = "name";
    renderProfiles();
    updateMonitorProfilePreview();
    updateProfileKeywordPreview();
    renderProfileWizard();
  });

  qs("btnSaveProfile").addEventListener("click", () => {
    void runButtonTask(
      { buttonId: "btnSaveProfile", actionKey: "saveProfile", logId: "logGeneral" },
      async () => {
        await saveProfileFromEditor();
      },
    );
  });

  qs("monitorProfileSelect").addEventListener("change", async (event) => {
    const profileId = event.target.value || "";
    if (!profileId) {
      selectedProfileId = "";
      renderProfiles();
      updateMonitorProfilePreview();
      await persistMonitorConfigFromUi();
      return;
    }
    selectProfile(profileId, true);
  });

  qs("btnProfilePrevStep").addEventListener("click", () => {
    goProfileWizardStep(-1);
  });

  qs("btnProfileNextStep").addEventListener("click", () => {
    if (!validateCurrentProfileWizardStep()) return;
    goProfileWizardStep(1);
  });

  qs("btnProfileStartMonitoring").addEventListener("click", () => {
    void runButtonTask(
      {
        buttonId: "btnProfileStartMonitoring",
        actionKey: "profileStartMonitoring",
        busyText: `⏳ ${translate("status.starting")}`,
        logId: "logGeneral",
      },
      async () => {
        const ok = await saveProfileFromEditor();
        if (!ok) return;
        activateTab("home");
        qs("btnStartMonitor").click();
      },
    );
  });

  qs("profileEditorName").addEventListener("input", () => {
    updateProfileNameCounter();
    updateProfileSummaryCard();
  });

  const setupProfileTagInput = (inputId, kind) => {
    const input = qs(inputId);
    if (!input) return;
    const flush = () => {
      const raw = String(input.value || "").trim();
      if (!raw) return;
      const tokens = raw
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      tokens.forEach((token) => addProfileKeyword(kind, token));
      input.value = "";
    };
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === ",") {
        event.preventDefault();
        flush();
      }
    });
    input.addEventListener("blur", flush);
  };

  setupProfileTagInput("profileWatchInput", "watch");
  setupProfileTagInput("profileExcludeInput", "exclude");


  qsa(".profile-watch-suggestion").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      appendKeywordToEditor("profileEditorPositive", btn.dataset.value || "");
      updateProfileSummaryCard();
    });
  });

  qsa(".profile-exclude-suggestion").forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      appendKeywordToEditor("profileEditorNegative", btn.dataset.value || "");
      updateProfileSummaryCard();
    });
  });

  qsa(".freq-card").forEach((card) => {
    card.addEventListener("click", () => {
      const copy = getWizardLocaleCopy();
      const level = resolvePlanLevel();
      const proOnly = card.dataset.proOnly === "1";
      if (level === "blocked" && proOnly) {
        appendLog("logGeneral", copy.freeFrequencyLock, "warn");
        const warning = qs("profileFrequencyWarning");
        if (warning) warning.textContent = copy.freeFrequencyLock;
        return;
      }

      const min = Number(card.dataset.min) || 5;
      const max = Number(card.dataset.max) || 10;
      qs("profileEditorMin").value = String(min);
      qs("profileEditorMax").value = String(max);
      updateFrequencyCardSelection(min, max);

      const warning = qs("profileFrequencyWarning");
      const highRisk = min <= 5;
      if (level === "blocked" && min < 15) {
        if (warning) {
          warning.textContent = copy.freeFrequencyLock;
        }
      } else if (warning) {
        warning.textContent = highRisk
          ? "Frequent checks increase detection risk. Use with caution."
          : "Monitoring runs in background. No need to keep this window open.";
      }
      updateProfileSummaryCard();
    });
  });

  ["notifyBrowser", "notifyWebhook", "notifyTelegram"].forEach(
    (id) => {
      const el = qs(id);
      if (!el) return;
      el.addEventListener("change", () => {
        updateProfileSummaryCard();
      });
    },
  );
}

function resolveMonitorPayload() {
  const config = buildMonitorConfigFromUi();

  return {
    ...config,
    selectedGroupIds: Array.from(selectedGroupIds),
  };
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "backgroundLog") {
    appendLog("logGeneral", message.message, "info");
  }

  if (message?.type === "error") {
    appendLog(
      "logGeneral",
      `[ERRO ${message.severity}] ${message.errorMessage}`,
      "err",
    );
  }

  if (message?.type === "groupsFetched") {
    setOrbState("connecting");
    appendLog(
      "logGeneral",
      translate("log.groups_loaded_so_far", { count: message.count }),
      "info",
    );
  }

  if (message?.type === "groupsChunk") {
    const hasSkeleton = !!qs("groupsList").querySelector(
      ".group-card.skeleton",
    );
    if (hasSkeleton) qs("groupsList").innerHTML = "";
    const chunk = Array.isArray(message.groups) ? message.groups : [];
    chunk.forEach((g) => {
      const key = String(g.id);
      lastLoadedGroups.set(key, g);
      upsertGroupCard(g);
    });
    const groupCount = qs("groupCount");
    if (groupCount) {
      groupCount.textContent = translate("groups.monitored_count", {
        count: selectedGroupIds.size,
      });
    }
    updateSelectedGroupCount();
    applyGroupsVisibilityFilter();
    void persistLoadedGroups();
  }

  if (message?.type === "groupsStreamDone") {
    setGroupFetchState(false);
    setOrbState(isMonitorRunning ? "monitoring" : "idle");
    if (message.success) {
      appendLog(
        "logGeneral",
        translate("log.groups_stream_done", {
          stopped: message.stopped ? translate("log.stopped_suffix") : "",
          total: message.total || lastLoadedGroups.size,
        }),
        "ok",
      );
    } else {
      appendLog(
        "logGeneral",
        translate("log.groups_stream_failed", { error: message.error }),
        "err",
      );
    }
    onboardingGroupsProgress.started = false;
  }

  if (message?.type === "monitorState") {
    setMonitorState(
      !!message.running,
      message.running ? translate("status.monitoring") : translate("status.stopped"),
    );
    if (!message.running) appendLog("logPosts", translate("log.monitor_stopped"), "warn");
    void refreshOnboardingStateFromContext();
  }

  if (message?.type === "monitorSleep") {
    if (message.active) {
      setOrbState("paused");
      setSleepBannerVisible(
        true,
        message.message || translate("home.sleep_banner"),
      );
      appendLog("logPosts", message.message || translate("log.sleep_mode_active"), "warn");
    } else {
      setSleepBannerVisible(false);
      setOrbState(isMonitorRunning ? "monitoring" : "idle");
      appendLog("logPosts", message.message || translate("log.sleep_mode_ended"), "ok");
    }
  }

  if (message?.type === "monitorTick") {
    if (message.phase === "start") {
      setOrbState("connecting");
      appendLog("logGeneral", message.message || translate("log.cycle_started"), "info");
      qs("monitorNextRun").textContent = translate("status.checking_now");
      syncHomeNextScanLabel();
      return;
    }
    const mins = Math.round((Number(message.nextDelayMs) || 0) / 60000);
    qs("monitorNextRun").textContent = translate("status.next_check", { mins });
    syncHomeNextScanLabel();
    if (message.warmup) {
      setOrbState("monitoring");
      appendLog(
        "logPosts",
        translate("log.warmup_done", { mins }),
        "info",
      );
    } else {
      setOrbState("monitoring");
      appendLog(
        "logPosts",
        translate("log.checked_posts", {
          polled: message.polledCount,
          matched: message.matchedCount,
          mins,
        }),
        "info",
      );
    }
  }

  if (message?.type === "monitorMatches") {
    setOrbState("lead");
    const matches = Array.isArray(message.matches) ? message.matches : [];
    if (!matches.length) return;
    appendLog(
      "logPosts",
      translate("log.new_matches", {
        count: matches.length,
        profile: message.profileName ? ` [${message.profileName}]` : "",
      }),
      "ok",
    );
    matches.slice(0, 10).forEach((p) => {
      const txt = (p.post_text || p.marketplace_text || "").slice(0, 110);
      appendLog(
        "logPosts",
        `  → ${p.group_name} | ${p.poster_name}: ${txt}`,
        "info",
      );
    });
    void refreshLeadsHistory();
  }

  if (message?.type === "monitorRawPosts") {
    const posts = Array.isArray(message.posts) ? message.posts : [];
    const feedTotal = Number(message.fetchedTotal) || posts.length;
    appendLog(
      "logPosts",
      translate("log.debug_cycle", {
        posts: posts.length,
        feed: feedTotal,
        profile: message.profileName ? ` [${message.profileName}]` : "",
      }),
      "info",
    );

    posts.forEach((p) => {
      const txt = (p.post_text || p.marketplace_text || "")
        .replace(/\s+/g, " ")
        .trim();
      const snippet = txt ? txt.slice(0, 120) : "(sem texto)";
      appendLog(
        "logPosts",
        `  • ${p.group_name || translate("groups.title")} | ${p.poster_name || translate("common.none")} | ${p.post_type || "post"} | ${snippet}`,
        "info",
      );
    });
  }

  if (message?.type === "monitorError") {
    const handledConnectionIssue = applyMonitorConnectionIssue({
      kind: message.issueKind,
      message: message.error,
    });
    if (handledConnectionIssue) {
      const kind = String(message.issueKind || "").trim() || classifyMonitorError(message.error);
      if (kind === "fb_tab_missing") {
        appendLog("logPosts", translate("log.monitor_fb_tab_missing"), "warn");
      } else {
        appendLog("logPosts", translate("log.monitor_fb_login_required"), "warn");
      }
      appendLog("logPosts", translate("log.monitor_fb_action_open"), "info");
    } else {
      setOrbState("error");
      appendLog("logPosts", translate("log.monitor_error", { error: message.error }), "err");
    }
  }

  if (message?.type === "take_profiles") {
    if (message.good) {
      const posts = Array.isArray(message.latest_posts)
        ? message.latest_posts
        : [];
      const filteredPosts =
        selectedGroupIds.size > 0
          ? posts.filter((p) => selectedGroupIds.has(String(p.group_id)))
          : posts;

      appendLog(
        "logPosts",
        translate("log.posts_received", {
          total: posts.length,
          selected: filteredPosts.length,
        }),
        "ok",
      );

      if (filteredPosts.length) {
        filteredPosts.slice(0, 8).forEach((p) => {
          const txt = (p.post_text || p.marketplace_text || "").slice(0, 100);
          appendLog(
            "logPosts",
            `🔔 [${p.post_type}] ${p.poster_name} em ${p.group_name}: ${txt}`,
            "info",
          );
        });
      } else {
        appendLog(
          "logPosts",
          translate("log.no_new_posts_selected"),
          "warn",
        );
      }
    } else {
      appendLog("logPosts", `❌ ${message.error_msg}`, "err");
    }
    setButtonLoading("btnGetPosts", false);
  }
});

qsa(".btn").forEach((btn) => {
  btn.dataset.label = btn.textContent;
});

setupTabs();
setupSidebarTooltips();
setupOnboardingWorkspaceActions();
setupProfileActions();
renderProfileWizard();
watchStorageUpdates();
chrome.runtime.sendMessage({ type: "panelOpened" }, () => {
  // no-op: background enforces single extension tab and may close this tab.
});

qs("btnMainMonitorToggle")?.addEventListener("click", () => {
  if (isMonitorRunning) qs("btnStopMonitor")?.click();
  else qs("btnStartMonitor")?.click();
});

qs("btnCheckLoginHero")?.addEventListener("click", () => {
  qs("btnCheckLogin")?.click();
});

chrome.runtime.sendMessage({ type: "checkLogin" }, (response) => {
  if (response?.loggedIn) {
    lastFacebookUserId = String(response.userId || "").trim();
    setLoginStatus(true, `${translate("status.logged")}: ${response.userId}`);
    appendLog("logAuth", translate("log.logged_as_user", { userId: response.userId }), "ok");
  } else {
    setLoginStatus(false, translate("status.not_logged"));
    appendLog("logAuth", translate("log.not_logged_facebook"), "err");
  }
  void refreshOnboardingStateFromContext();
});

qs("btnCheckLogin").addEventListener("click", () => {
  setButtonLoading("btnCheckLogin", true);
  chrome.runtime.sendMessage({ type: "checkLogin" }, (response) => {
    setButtonLoading("btnCheckLogin", false);
    if (response?.loggedIn) {
      lastFacebookUserId = String(response.userId || "").trim();
      setLoginStatus(true, `${translate("status.logged")}: ${response.userId}`);
      appendLog("logAuth", translate("log.user_id_short", { userId: response.userId }), "ok");
    } else {
      setLoginStatus(false, translate("status.not_logged"));
      appendLog("logAuth", translate("log.not_logged"), "err");
    }
    void refreshOnboardingStateFromContext();
  });
});

qs("btnGetToken").addEventListener("click", async () => {
  setButtonLoading("btnGetToken", true);
  appendLog("logAuth", translate("log.fetching_token"), "info");
  try {
    const html = await fetchFacebookSettingsHtml();
    const match = html.match(
      /"DTSGInitialData",\s*\[[^\]]*\],\s*\{[^{}]*"token"\s*:\s*"([^"]+)"[^{}]*\}/,
    );
    if (match?.[1])
      appendLog("logAuth", `✅ fb_dtsg: ${match[1].substring(0, 30)}...`, "ok");
    else
      appendLog(
        "logAuth",
        translate("log.token_not_found"),
        "err",
      );
  } catch (e) {
    appendLog(
      "logAuth",
      translate("log.error_generic", { error: e?.message || String(e) }),
      "err",
    );
  }
  setButtonLoading("btnGetToken", false);
});

qs("btnGetAllTokens").addEventListener("click", async () => {
  setButtonLoading("btnGetAllTokens", true);
  appendLog("logAuth", translate("log.fetching_all_tokens"), "info");
  try {
    const html = await fetchFacebookSettingsHtml();
    const tokens = {
      lsd: html.match(/"token":\s*"([^"]+)"/)?.[1],
      userId: html.match(/"actorId":\s*"([^"]+)"/)?.[1],
      dtsg: html.match(
        /"DTSGInitialData",\s*\[[^\]]*\],\s*\{[^{}]*"token"\s*:\s*"([^"]+)"[^{}]*\}/,
      )?.[1],
      rev: html.match(/"consistency":\s*\{"rev":\s*(\d+)\}/)?.[1],
      hsi: html.match(/"hsi":\s*"([^"]+)"/)?.[1],
    };

    Object.entries(tokens).forEach(([k, v]) => {
      if (v)
        appendLog("logAuth", `✅ ${k}: ${String(v).substring(0, 40)}`, "ok");
      else appendLog("logAuth", translate("log.token_missing", { key: k }), "err");
    });
  } catch (e) {
    appendLog(
      "logAuth",
      translate("log.error_generic", { error: e?.message || String(e) }),
      "err",
    );
  }
  setButtonLoading("btnGetAllTokens", false);
});

qs("btnGetDate").addEventListener("click", () => {
  setButtonLoading("btnGetDate", true);
  chrome.runtime.sendMessage({ type: "getCreationDate" }, (response) => {
    setButtonLoading("btnGetDate", false);
    const el = qs("creationDate");
    if (response?.success) {
      el.textContent = response.creationDate;
      el.style.display = "inline-flex";
      appendLog(
        "logGeneral",
        translate("log.creation_date", { date: response.creationDate }),
        "ok",
      );
    } else {
      el.style.display = "none";
      appendLog(
        "logGeneral",
        translate("log.creation_date_failed"),
        "err",
      );
    }
  });
});

qs("btnGetGroups").addEventListener("click", () => {
  setGroupFetchState(true);
  renderGroupsLoadingSkeleton();
  lastLoadedGroups.clear();
  void chrome.storage.local.set({ [STORAGE_LOADED_GROUPS_KEY]: [] });
  qs("groupCount").textContent = translate("groups.loading_groups");

  chrome.runtime.sendMessage({ type: "startGroupsStream" }, (response) => {
    if (!response?.success) {
      setGroupFetchState(false);
      qs("groupCount").textContent = translate("groups.error_short");
      appendLog(
        "logGeneral",
        translate("log.groups_stream_failed", { error: response?.error }),
        "err",
      );
    }
  });
});

qs("btnStopGroups").addEventListener("click", () => {
  if (!isGroupFetchRunning) return;
  chrome.runtime.sendMessage({ type: "stopGroupsStream" }, () => {
    appendLog("logGeneral", translate("log.stop_groups_requested"), "warn");
  });
});

qs("btnSelectAllGroups").addEventListener("click", () => {
  void runButtonTask(
    { buttonId: "btnSelectAllGroups", actionKey: "selectAllGroups", logId: "logGeneral" },
    async () => {
      if (!lastLoadedGroups.size) {
        appendLog("logGeneral", translate("log.load_groups_first"), "warn");
        return;
      }
      qsa("#groupsList .group-card").forEach((card) => {
        if (card.style.display === "none") return;
        const gid = String(card.dataset.groupId || "");
        if (gid) selectedGroupIds.add(gid);
      });
      await persistSelectedGroupIds();
      qsa(".group-select").forEach((el) => {
        const card = el.closest(".group-card");
        if (!card || card.style.display === "none") return;
        el.checked = true;
        card.classList.add("selected");
      });
      appendLog("logGeneral", translate("log.selection_saved"), "ok");
    },
  );
});

qs("btnClearGroupSelection").addEventListener("click", () => {
  void runButtonTask(
    { buttonId: "btnClearGroupSelection", actionKey: "clearGroupSelection", logId: "logGeneral" },
    async () => {
      selectedGroupIds.clear();
      await persistSelectedGroupIds();
      qsa(".group-select").forEach((el) => {
        el.checked = false;
        const card = el.closest(".group-card");
        if (card) card.classList.remove("selected");
      });
      appendLog("logGeneral", translate("log.selection_cleared"), "warn");
    },
  );
});

qs("btnStartMonitor").addEventListener("click", () => {
  void runButtonTask(
    {
      buttonId: "btnStartMonitor",
      actionKey: "startMonitor",
      busyText: `⏳ ${translate("status.starting")}`,
      logId: "logPosts",
      errorKey: "log.start_monitor_failed",
    },
    async () => {
      if (!savedProfiles.length) {
        appendLog("logPosts", translate("profiles.none_saved"), "warn");
        return;
      }
      if (!selectedProfileId || !getProfileById(selectedProfileId)) {
        const fallback = savedProfiles[0];
        if (!fallback?.id) {
          appendLog("logPosts", translate("log.select_alert_first"), "warn");
          return;
        }
        selectProfile(String(fallback.id), true);
      }

      if (selectedGroupIds.size === 0) {
        appendLog(
          "logPosts",
          translate("log.select_one_group_before_monitor"),
          "warn",
        );
        return;
      }

      const payload = resolveMonitorPayload();
      const planCheck = enforcePlanForMonitorStart(payload);
      if (!planCheck.ok) {
        appendLog("logPosts", planCheck.error, "warn");
        return;
      }

      await persistMonitorConfigFromUi();
      setMonitorState(true, translate("status.starting"));

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "startPostMonitor", payload },
          (reply) => resolve(reply || {}),
        );
      });

      if (!response?.success) {
        setMonitorState(false, translate("status.stopped"));
        appendLog(
          "logPosts",
          translate("log.start_monitor_failed", {
            error: response?.error || translate("common.none"),
          }),
          "err",
        );
        return;
      }
      if (response?.sleeping) {
        setMonitorState(false, translate("status.sleep_mode"));
        setOrbState("paused");
        setSleepBannerVisible(true, translate("home.sleep_banner"));
        appendLog("logPosts", translate("log.sleep_mode_active"), "warn");
        return;
      }
      appendLog("logPosts", translate("log.monitor_started"), "ok");
      void setOnboardingState("ready");
    },
  );
});

async function updateAccountUi() {
  const session = await getLicenseSession();
  const accountStatus = qs("accountStatus");
  if (!accountStatus) return;
  if (session?.email || session?.licenseKeyMasked) {
    const level = resolvePlanLevel();
    const stateKey =
      level === "pro"
        ? "account.license_active"
        : level === "trial"
          ? "account.trial_active"
          : "account.license_pending";
    accountStatus.textContent = translate(stateKey, {
      email: session.email || session.licenseKeyMasked || translate("common.none"),
      key: session.licenseKeyMasked || translate("common.none"),
    });
  } else {
    accountStatus.textContent = translate("account.no_license");
  }
}

async function maybeRefreshPlanFromCloud(force = false) {
  if (activePlanRefreshPromise) {
    return await activePlanRefreshPromise;
  }

  activePlanRefreshPromise = (async () => {
    const session = await getLicenseSession();
    if (!session?.email && !session?.licenseKey) return;

    const now = Date.now();
    if (!force && now < nextPlanSyncAt) return;
    if (!force && cachedPlanState && isPlanCacheFresh(cachedPlanState)) {
      nextPlanSyncAt = now + PLAN_SYNC_INTERVAL_MS;
      return;
    }

    try {
      const fresh = await refreshLicenseState(session);
      if (fresh) {
        cachedPlanState = {
          plan: fresh.plan,
          trialEnd: fresh.trialEnd,
          purchaseDate: fresh.purchaseDate,
          cachedAt: Date.now(),
          source: fresh.source,
        };
        nextPlanSyncAt = now + PLAN_SYNC_INTERVAL_MS;
      } else {
        nextPlanSyncAt = now + PLAN_SYNC_FAILURE_BACKOFF_MS;
      }
    } catch (_) {
      nextPlanSyncAt = now + PLAN_SYNC_FAILURE_BACKOFF_MS;
    }

    renderPlanBanner();
    renderProfileWizard();
    renderGlobalFrequencyUi();
  })();

  try {
    return await activePlanRefreshPromise;
  } finally {
    activePlanRefreshPromise = null;
  }
}

async function refreshLicenseStatusNow(logNoChange = true) {
  appendLog("logGeneral", translate("msg.license_checking"), "info");
  const before = resolvePlanLevel();
  await maybeRefreshPlanFromCloud(true);
  const after = resolvePlanLevel();
  if (after === "pro" && before !== "pro") {
    appendLog("logGeneral", translate("msg.license_confirmed"), "ok");
    return true;
  }
  if (after === "trial" && before !== "trial") {
    appendLog("logGeneral", translate("msg.trial_started"), "ok");
    return true;
  }
  if (logNoChange) {
    appendLog("logGeneral", translate("msg.license_status_refreshed"), "info");
  }
  return after === "pro" || after === "trial";
}

function getGumroadCheckoutUrl() {
  const config = getSupabaseConfig();
  if (!/^https?:\/\//i.test(config.gumroadProductUrl)) {
    throw new Error(translate("msg.license_buy_unavailable"));
  }
  return config.gumroadProductUrl;
}

async function resetWorkspaceForChangedEmail(nextEmail) {
  const normalizedNext = String(nextEmail || "").trim().toLowerCase();
  if (!normalizedNext) return false;

  const session = await getLicenseSession();
  const stored = await chrome.storage.local.get([STORAGE_LICENSE_EMAIL_KEY]);
  const previousEmail = String(
    session?.email || stored?.[STORAGE_LICENSE_EMAIL_KEY] || "",
  )
    .trim()
    .toLowerCase();

  if (!previousEmail || previousEmail === normalizedNext) return false;

  await clearLicenseSession();
  chrome.runtime.sendMessage({ type: "stopPostMonitor" }, () => {});
  await chrome.storage.local.remove([
    STORAGE_SELECTED_GROUP_IDS_KEY,
    STORAGE_MONITOR_CONFIG_KEY,
    STORAGE_PROFILES_KEY,
    STORAGE_LOADED_GROUPS_KEY,
    STORAGE_GLOBAL_FREQUENCY_KEY,
    STORAGE_ONBOARDING_STATE_KEY,
    STORAGE_NOTIFICATION_SETTINGS_KEY,
  ]);

  chrome.runtime.sendMessage({ type: "clearLeadHistory" }, () => {});

  selectedGroupIds = new Set();
  lastLoadedGroups.clear();
  savedProfiles = [];
  selectedProfileId = "";
  leadsHistory = [];
  onboardingState = "welcome";
  onboardingAutoGroupLoadAttempted = false;
  onboardingGroupsProgress = { started: false, lastCount: 0, lastAnnouncedAt: 0 };
  const resetState = buildWorkspaceResetState(getDefaultFrequencyForPlan(), Date.now());
  globalMonitorFrequency = resetState.globalMonitorFrequency;
  notificationSettings = resetState.notificationSettings;

  if (qs("groupsList")) qs("groupsList").innerHTML = "";
  updateSelectedGroupCount();
  renderProfiles();
  renderLeads();
  renderHomeInsights();
  renderGroupsLeaderboard();
  resetProfileEditorDraft();
  renderGlobalFrequencyUi();
  applyNotificationSettingsToUi(notificationSettings);
  await setOnboardingState(resetState.onboardingState);
  await chrome.storage.local.set({
    [STORAGE_PLAN_STATE_KEY]: resetState.planState,
  });
  cachedPlanState = resetState.planState;
  appendLog("logGeneral", "Account changed. Local workspace reset.", "warn");
  return true;
}

async function handleLicenseActivation() {
  if (!isTermsAccepted) {
    appendAuthGateLog(translate("auth.terms_required"), "warn");
    return;
  }
  setAuthMode("license");
  const licenseKey = String(qs("authCode")?.value || "").trim();
  if (licenseKey.length < 8) {
    appendAuthGateLog(translate("auth.invalid_license_key"), "warn");
    return;
  }
  try {
    appendAuthGateLog(translate("auth.checking"), "info");
    const session = await activateLicense(licenseKey);
    await resetWorkspaceForChangedEmail(session.email || "");
    setTrialUpsellVisible(false);
    renderPlanBanner();
    renderProfileWizard();
    renderGlobalFrequencyUi();
    setAuthGateVisible(resolvePlanLevel() === "blocked");
    await updateAccountUi();
    appendAuthGateLog(translate("auth.license_activated"), "ok");
    appendLog(
      "logGeneral",
      translate("auth.connected", {
        email: session.email || session.licenseKeyMasked || "license",
      }),
      "ok",
    );
  } catch (err) {
    appendAuthGateLog(extractUiErrorMessage(err), "err");
  }
}

async function handleTrialStart() {
  if (!isTermsAccepted) {
    appendAuthGateLog(translate("auth.terms_required"), "warn");
    return;
  }
  setAuthMode("trial");
  const email = String(qs("authEmail")?.value || "")
    .trim()
    .toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    appendAuthGateLog(translate("auth.invalid_email"), "warn");
    return;
  }
  await resetWorkspaceForChangedEmail(email);
  try {
    appendAuthGateLog(translate("auth.checking"), "info");
    const session = await startLicenseTrial(email);
    setTrialUpsellVisible(true);
    renderPlanBanner();
    renderProfileWizard();
    renderGlobalFrequencyUi();
    setAuthGateVisible(resolvePlanLevel() === "blocked");
    await updateAccountUi();
    appendAuthGateLog(translate("auth.trial_started"), "ok");
    appendLog(
      "logGeneral",
      translate("auth.connected", { email: session.email || email }),
      "ok",
    );
  } catch (err) {
    appendAuthGateLog(extractUiErrorMessage(err), "err");
  }
}

async function bootstrapAuthGate() {
  const session = await getLicenseSession();
  if (session?.email) {
    qs("authEmail").value = session.email;
  } else {
    const data = await chrome.storage.local.get([STORAGE_LICENSE_EMAIL_KEY]);
    qs("authEmail").value = String(data?.[STORAGE_LICENSE_EMAIL_KEY] || "");
  }
  if (session?.licenseKey) {
    qs("authCode").value = session.licenseKey;
  }
  setAuthMode(session?.licenseKey ? "license" : session?.email ? "trial" : "");
  setTrialUpsellVisible(resolvePlanLevel() === "trial");

  if (!session?.email && !session?.licenseKey) {
    setAuthGateVisible(true);
    syncAuthTermsUi();
    return;
  }

  try {
    await maybeRefreshPlanFromCloud(true);
  } catch (_) {
    // Keep the last known local state when the refresh fails.
  }

  setAuthGateVisible(resolvePlanLevel() === "blocked");
  await updateAccountUi();
  syncAuthTermsUi();
}

qs("btnStopMonitor").addEventListener("click", () => {
  if (!isMonitorRunning) return;
  chrome.runtime.sendMessage({ type: "stopPostMonitor" }, () => {
    setMonitorState(false, translate("status.stopped"));
  });
});

qs("btnOpenTechLog")?.addEventListener("click", () => {
  toggleTechnicalLogOverlay(true);
});

qs("btnOpenTechLogSettings")?.addEventListener("click", () => {
  toggleTechnicalLogOverlay(true);
});

qs("btnCloseTechLog").addEventListener("click", () => {
  toggleTechnicalLogOverlay(false);
});

qs("logOverlay").addEventListener("click", (event) => {
  if (event.target?.id === "logOverlay") toggleTechnicalLogOverlay(false);
});

qs("btnCopyTechLog").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(formatTechnicalLogForClipboard());
    appendLog("logGeneral", translate("msg.log_copied"), "ok");
  } catch (err) {
    appendLog(
      "logGeneral",
      translate("msg.log_copy_failed", { error: err?.message || String(err) }),
      "err",
    );
  }
});

qs("btnClearTechLog").addEventListener("click", () => {
  technicalLogEntries = [];
  renderTechnicalLogOverlay();
});

qs("btnGuidedTipsDismiss")?.addEventListener("click", () => {
  void dismissGuidedTips();
});

function clearLeadHistoryFromUi() {
  chrome.runtime.sendMessage({ type: "clearLeadHistory" }, (response) => {
    if (response?.success) {
      leadsHistory = [];
      renderLeads();
      renderHomeInsights();
      renderGroupsLeaderboard();
      appendLog("logGeneral", translate("msg.history_cleared"), "ok");
    } else {
      appendLog(
        "logGeneral",
        translate("msg.history_clear_failed", {
          error: response?.error || translate("common.none"),
        }),
        "err",
      );
    }
  });
}

qs("btnClearHistory")?.addEventListener("click", clearLeadHistoryFromUi);
qs("btnClearLeadsTop")?.addEventListener("click", clearLeadHistoryFromUi);

qs("btnPlanUpgrade").addEventListener("click", () => {
  void runButtonTask(
    {
      buttonId: "btnPlanUpgrade",
      actionKey: "planUpgrade",
      busyText: `⏳ ${translate("common.checking")}`,
      logId: "logGeneral",
      errorKey: "msg.upgrade_failed",
    },
    async () => {
      await chrome.tabs.create({ url: getGumroadCheckoutUrl() });
      appendLog("logGeneral", translate("msg.license_buy_opening"), "ok");
    },
  );
});

qs("btnPlanOpenSettings").addEventListener("click", () => {
  activateTab("settings");
});

qs("btnPlanLockUpgrade").addEventListener("click", () => {
  qs("btnPlanUpgrade").click();
});

qs("btnPlanLockSignOut").addEventListener("click", () => {
  qs("btnSignOut").click();
});

qs("btnPlanClearLicense").addEventListener("click", () => {
  qs("btnSignOut").click();
});

qs("btnSignOut").addEventListener("click", () => {
  void runButtonTask(
    { buttonId: "btnSignOut", actionKey: "signOut", logId: "logGeneral" },
    async () => {
      await clearLicenseSession();
      await updateAccountUi();
      renderPlanBanner();
      setAuthGateVisible(true);
      appendLog("logGeneral", translate("msg.signed_out"), "warn");
    },
  );
});

qs("btnSaveSleepSchedule").addEventListener("click", () => {
  void runButtonTask(
    { buttonId: "btnSaveSleepSchedule", actionKey: "saveSleepSchedule", logId: "logGeneral", errorKey: "msg.sleep_save_failed" },
    async () => {
      const start = parseTimeString(qs("sleepStartTime").value, 22, 0);
      const end = parseTimeString(qs("sleepEndTime").value, 7, 0);
      const days = qsa(".sleep-day")
        .filter((el) => el.checked)
        .map((el) => Number(el.value));
      const schedule = {
        enabled: !!qs("sleepEnabled").checked,
        startHour: start.hour,
        startMinute: start.minute,
        endHour: end.hour,
        endMinute: end.minute,
        days: days.length ? days : [1, 2, 3, 4, 5, 6, 0],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      };

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "setSleepSchedule", schedule },
          (reply) => resolve(reply || {}),
        );
      });
      if (!response?.success) {
        throw new Error(response?.error || translate("common.none"));
      }
      sleepScheduleState = response.schedule;
      appendLog("logGeneral", translate("msg.sleep_saved"), "ok");
      loadSleepScheduleUi();
    },
  );
});

qs("sleepEnabled").addEventListener("change", () => {
  syncSleepControlsUiState();
});

qs("btnSaveNotifications")?.addEventListener("click", () => {
  void runButtonTask(
    { buttonId: "btnSaveNotifications", actionKey: "saveNotifications", logId: "logGeneral" },
    async () => {
      await persistNotificationSettings();
    },
  );
});

qs("btnTestDesktop")?.addEventListener("click", () => {
  void runButtonTask(
    { buttonId: "btnTestDesktop", actionKey: "testDesktop", logId: "logGeneral" },
    async () => {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "testNotificationChannel",
            channel: "desktop",
            payload: buildTestLeadPayload(),
            settings: readNotificationSettingsFromUi(),
          },
          (reply) => resolve(reply || {}),
        );
      });
      if (response?.success) appendLog("logGeneral", "Desktop test sent.", "ok");
      else throw new Error(response?.error || "Desktop test failed.");
    },
  );
});

qs("btnTestWebhook")?.addEventListener("click", () => {
  void runButtonTask(
    { buttonId: "btnTestWebhook", actionKey: "testWebhook", logId: "logGeneral" },
    async () => {
      const settings = readNotificationSettingsFromUi();
      if (!settings.webhookUrl) {
        appendLog("logGeneral", "Webhook URL is required.", "warn");
        return;
      }

      const perm = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "checkWebhookPermission", webhookUrl: settings.webhookUrl },
          (reply) => resolve(reply || {}),
        );
      });
      if (!perm?.granted) throw new Error("Webhook permission denied.");

      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "testNotificationChannel",
            channel: "webhook",
            payload: buildTestLeadPayload(),
            settings,
          },
          (reply) => resolve(reply || {}),
        );
      });
      if (response?.success) appendLog("logGeneral", "Webhook test sent.", "ok");
      else throw new Error(response?.error || "Webhook test failed.");
    },
  );
});

qs("btnTestTelegram")?.addEventListener("click", () => {
  void runButtonTask(
    { buttonId: "btnTestTelegram", actionKey: "testTelegram", logId: "logGeneral" },
    async () => {
      const settings = readNotificationSettingsFromUi();
      if (!settings.telegramChatId) {
        appendLog("logGeneral", "Telegram chat_id is required.", "warn");
        return;
      }
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "testNotificationChannel",
            channel: "telegram",
            payload: buildTestLeadPayload(),
            settings,
          },
          (reply) => resolve(reply || {}),
        );
      });
      if (response?.success) appendLog("logGeneral", "Telegram test sent.", "ok");
      else throw new Error(response?.error || "Telegram test failed.");
    },
  );
});

qs("btnAuthBuyLicense")?.addEventListener("click", () => {
  void runButtonTask(
    {
      buttonId: "btnAuthBuyLicense",
      actionKey: "authBuyLicense",
      logId: "logAuthGate",
      errorKey: "msg.upgrade_failed",
    },
    async () => {
      await chrome.tabs.create({ url: getGumroadCheckoutUrl() });
      appendAuthGateLog(translate("msg.license_buy_opening"), "ok");
    },
  );
});

qs("btnDashboardTrialBuy")?.addEventListener("click", () => {
  qs("btnAuthBuyLicense")?.click();
});

qs("btnAuthModeLicense")?.addEventListener("click", () => {
  setAuthMode("license");
  qs("authCode")?.focus();
});

qs("btnAuthModeTrial")?.addEventListener("click", () => {
  setAuthMode("trial");
  qs("authEmail")?.focus();
});

qs("btnAuthResend").addEventListener("click", () => {
  void runButtonTask(
    {
      buttonId: "btnAuthResend",
      actionKey: "authStartTrial",
      logId: "logAuthGate",
      errorKey: "msg.action_failed",
    },
    async () => {
      await handleTrialStart();
    },
  );
});

qs("btnAuthVerifyCode").addEventListener("click", () => {
  void runButtonTask(
    { buttonId: "btnAuthVerifyCode", actionKey: "authVerifyCode", logId: "logAuthGate", errorKey: "msg.action_failed" },
    async () => {
      await handleLicenseActivation();
    },
  );
});

qs("authTermsAccepted")?.addEventListener("change", async (event) => {
  await setTermsAccepted(!!event.target?.checked);
});

qs("btnAuthViewTerms")?.addEventListener("click", (event) => {
  event.preventDefault();
  event.stopPropagation();
  toggleTermsOverlay(true);
});

qs("btnCloseTerms")?.addEventListener("click", () => {
  toggleTermsOverlay(false);
});

qs("termsOverlay")?.addEventListener("click", (event) => {
  if (event.target?.id === "termsOverlay") toggleTermsOverlay(false);
});

qs("languageSelect").addEventListener("change", async (event) => {
  await setLanguage(String(event.target.value || "en").toLowerCase());
});

qs("authLanguageSelect").addEventListener("change", async (event) => {
  await setLanguage(String(event.target.value || "en").toLowerCase());
});

qs("groupsOnlySelected").addEventListener("change", () => {
  applyGroupsVisibilityFilter();
});

qs("groupsSearch").addEventListener("input", () => {
  applyGroupsVisibilityFilter();
});

qsa(".settings-freq-card").forEach((card) => {
  card.addEventListener("click", async () => {
    const pair = {
      min: Number(card.dataset.min) || 5,
      max: Number(card.dataset.max) || 10,
    };
    const level = resolvePlanLevel();
    const proOnly = card.dataset.proOnly === "1";
    if (level === "blocked" && proOnly) {
      appendLog("logGeneral", translate("plan.locked_action"), "warn");
      await persistGlobalMonitorFrequency({ min: 15, max: 20 });
      return;
    }

    if (pair.min === 3) {
      if (pair.max !== 8) {
      const confirmed = window.confirm(translate("settings.freq_confirm_3_5"));
      if (!confirmed) return;
      }
    }

    if (pair.min === 1) {
      const confirmed = window.confirm(translate("settings.freq_confirm_1_3"));
      if (!confirmed) return;
    }

    await persistGlobalMonitorFrequency(pair);
  });
});

["leadsProfileFilter", "leadsTextFilter", "leadsOnlySelectedGroups"].forEach(
  (id) => {
    qs(id).addEventListener("input", () => {
      renderLeads();
    });
    qs(id).addEventListener("change", () => {
      renderLeads();
    });
  },
);

["profileEditorPositive", "profileEditorNegative"].forEach((id) => {
  qs(id).addEventListener("input", () => {
    updateProfileKeywordPreview();
  });
});

["profileEditorMin", "profileEditorMax"].forEach((id) => {
  qs(id).addEventListener("change", () => {
    updateProfileKeywordPreview();
  });
});

(async () => {
  await loadLanguage();
  await loadTermsAcceptanceState();
  await loadOnboardingState();
  await loadGuidedTipsPreference();
  cachedPlanState = await loadPlanState();
  renderPlanBanner();
  await updateAccountUi();
  await bootstrapAuthGate();
  await loadGlobalMonitorFrequency();
  await loadNotificationSettings();
  await loadSleepScheduleUi();
  await loadSelectedGroupIds();
  await loadMonitorConfigToUi();
  await loadProfiles();
  await loadPersistedGroups();
  await refreshLeadsHistory();
  updateMonitorProfilePreview();
  syncProfileEditorChipsFromFields();
  updateProfileKeywordPreview();
  renderProfileWizard();

  if (selectedProfileId && getProfileById(selectedProfileId)) {
    selectProfile(selectedProfileId, true);
  }

  chrome.runtime.sendMessage({ type: "getPostMonitorState" }, (response) => {
    if (response?.success) {
      if (response.sleepModeActive) {
        setMonitorState(false, translate("status.sleep_mode"));
        setOrbState("paused");
        setSleepBannerVisible(true, translate("home.sleep_banner"));
      } else {
        setMonitorState(
          !!response.running,
          response.running ? translate("status.monitoring") : translate("status.stopped"),
        );
        setSleepBannerVisible(false);
      }
      if (response.connectionIssue) {
        applyMonitorConnectionIssue(response.connectionIssue);
      }
    } else {
      setMonitorState(false, translate("status.stopped"));
      setSleepBannerVisible(false);
    }
    void refreshOnboardingStateFromContext();
  });

  await refreshOnboardingStateFromContext();
  renderGuidedHistory();
})();
