function qs(id) {
  return document.getElementById(id);
}

function qsa(selector) {
  return Array.from(document.querySelectorAll(selector));
}

const STORAGE_SELECTED_GROUP_IDS_KEY = "selectedGroupIds";
const STORAGE_MONITOR_CONFIG_KEY = "monitorConfig";
const STORAGE_PROFILES_KEY = "savedProfiles";
const STORAGE_LOADED_GROUPS_KEY = "loadedGroups";

let selectedGroupIds = new Set();
const lastLoadedGroups = new Map();
let isGroupFetchRunning = false;
let isMonitorRunning = false;
let savedProfiles = [];
let selectedProfileId = "";
let leadsHistory = [];

function appendLog(logId, text, type = "") {
  const log = qs(logId);
  if (!log) return;
  const line = document.createElement("div");
  line.className = type;
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${text}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function setLoginStatus(ok, label) {
  const el = qs("loginStatus");
  el.className = `status ${ok ? "status-ok" : "status-error"}`;
  el.innerHTML = `<span class="status-dot"></span> ${label}`;
}

function setButtonLoading(id, loading) {
  const btn = qs(id);
  if (!btn) return;
  btn.disabled = !!loading;
  btn.textContent = loading ? "⏳ aguardando..." : btn.dataset.label;
}

function setGroupFetchState(running) {
  isGroupFetchRunning = running;
  qs("btnGetGroups").disabled = running;
  qs("btnStopGroups").disabled = !running;
  qs("btnGetGroups").textContent = running
    ? "⏳ buscando..."
    : qs("btnGetGroups").dataset.label;
}

function setMonitorState(running, label) {
  isMonitorRunning = running;
  qs("btnStartMonitor").disabled = running;
  qs("btnStopMonitor").disabled = !running;
  const status = qs("monitorStatus");
  status.textContent = label || (running ? "escutando..." : "parado");
  status.style.color = running ? "#166534" : "#64748b";
  if (!running) {
    qs("monitorNextRun").textContent = "aguardando...";
  }
}

function updateSelectedGroupCount() {
  qs("selectedGroupCount").textContent = `${selectedGroupIds.size} selecionado(s)`;
}

function updateLeadsCount() {
  const count = Array.isArray(leadsHistory) ? leadsHistory.length : 0;
  qs("leadsCount").textContent = `${count} lead(s) em 7 dias`;
}

function applyGroupsVisibilityFilter() {
  const onlySelected = !!qs("groupsOnlySelected")?.checked;
  qsa("#groupsList .group-card").forEach((card) => {
    const gid = card.dataset.groupId || "";
    const visible = !onlySelected || selectedGroupIds.has(String(gid));
    card.style.display = visible ? "" : "none";
  });
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
  qs("groupCount").textContent = `${groups.length} grupo(s)`;
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

  const img = document.createElement("img");
  img.src = g.image || fallbackAvatarDataUri();
  img.alt = g.name || "Grupo";
  img.addEventListener("error", () => {
    img.src = fallbackAvatarDataUri();
  });

  const top = document.createElement("div");
  top.className = "group-top";

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = g.name || "Sem nome";

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.textContent = `${g.privacy || ""} · ${g.members || ""} · ID: ${g.id ?? ""}`;

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.className = "group-select";
  checkbox.checked = selectedGroupIds.has(String(g.id));
  checkbox.title = "Selecionar grupo";
  const applySelectionState = (selected) => {
    checkbox.checked = selected;
    card.classList.toggle("selected", selected);
  };
  applySelectionState(checkbox.checked);

  const toggleSelection = async () => {
    const groupId = String(g.id);
    const next = !selectedGroupIds.has(groupId);
    if (next) selectedGroupIds.add(groupId);
    else selectedGroupIds.delete(groupId);
    applySelectionState(next);
    await persistSelectedGroupIds();
  };

  card.addEventListener("click", async () => {
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

function firstNonEmpty(...values) {
  for (const value of values) {
    const txt = String(value || "").trim();
    if (txt) return txt;
  }
  return "";
}

function buildLink(label, href) {
  const a = document.createElement("a");
  a.textContent = label;
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  return a;
}

function renderLeads() {
  const list = qs("leadsList");
  list.innerHTML = "";
  const profileFilter = qs("leadsProfileFilter")?.value || "";
  const textFilter = String(qs("leadsTextFilter")?.value || "")
    .trim()
    .toLowerCase();
  const onlySelectedGroups = !!qs("leadsOnlySelectedGroups")?.checked;

  let filtered = [...leadsHistory];
  if (profileFilter) {
    filtered = filtered.filter((lead) => String(lead.profileName || "") === profileFilter);
  }
  if (onlySelectedGroups) {
    filtered = filtered.filter((lead) =>
      selectedGroupIds.has(String(lead.group_id || "")),
    );
  }
  if (textFilter) {
    filtered = filtered.filter((lead) => {
      const haystack = [
        lead.group_name,
        lead.poster_name,
        lead.post_text,
        lead.marketplace_text,
      ]
        .map((v) => String(v || "").toLowerCase())
        .join(" ");
      return haystack.includes(textFilter);
    });
  }

  qs("leadsCount").textContent = `${filtered.length} lead(s) em 7 dias`;

  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "Nenhum lead histórico (últimos 7 dias).";
    list.appendChild(empty);
    return;
  }

  filtered.forEach((lead) => {
    const card = document.createElement("div");
    card.className = "lead-card";

    const head = document.createElement("div");
    head.className = "lead-head";

    const left = document.createElement("div");
    const title = document.createElement("div");
    title.className = "lead-title";
    title.textContent = `${lead.group_name || "Grupo"} • ${lead.poster_name || "Pessoa"}`;
    const meta = document.createElement("div");
    meta.className = "lead-meta";
    meta.textContent = `${formatLeadDate(lead.detectedAt)}${lead.profileName ? ` • profile: ${lead.profileName}` : ""}`;
    left.appendChild(title);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "lead-meta";
    right.textContent = lead.post_type || "";

    head.appendChild(left);
    head.appendChild(right);

    const text = document.createElement("div");
    text.className = "lead-text";
    text.textContent = firstNonEmpty(lead.post_text, lead.marketplace_text, "(sem texto)");

    const links = document.createElement("div");
    links.className = "lead-links";
    if (lead.post_url) links.appendChild(buildLink("Link do Post", lead.post_url));
    if (lead.user_profile_url) {
      links.appendChild(buildLink("Perfil da Pessoa", lead.user_profile_url));
    }
    if (lead.group_url) links.appendChild(buildLink("Link do Grupo", lead.group_url));

    card.appendChild(head);
    card.appendChild(text);
    card.appendChild(links);
    list.appendChild(card);
  });
}

async function refreshLeadsHistory() {
  chrome.runtime.sendMessage({ type: "getLeadHistory" }, (response) => {
    if (!response?.success) {
      appendLog("logPosts", `❌ Falha ao carregar histórico: ${response?.error}`, "err");
      return;
    }
    leadsHistory = Array.isArray(response.leads) ? response.leads : [];
    const profileSelect = qs("leadsProfileFilter");
    if (profileSelect) {
      const previous = profileSelect.value;
      const profileNames = Array.from(
        new Set(leadsHistory.map((lead) => String(lead.profileName || "").trim()).filter(Boolean)),
      );
      profileSelect.innerHTML = '<option value="">Todos profiles</option>';
      profileNames.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        profileSelect.appendChild(opt);
      });
      profileSelect.value = profileNames.includes(previous) ? previous : "";
    }
    renderLeads();
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
  container.innerHTML = "";
  if (!keywords.length) {
    const empty = document.createElement("div");
    empty.className = "kw-empty";
    empty.textContent = "Nenhuma palavra";
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
    minMinutes: Number(selected?.minMinutes) || 3,
    maxMinutes: Number(selected?.maxMinutes) || 7,
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
      const tab = btn.dataset.tab;
      qsa(".tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      qsa(".panel").forEach((p) => {
        p.classList.toggle("active", p.dataset.panel === tab);
      });
    });
  });
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
  return `${pos} positivas · ${neg} negativas · ${profile.minMinutes || 3}-${profile.maxMinutes || 7} min`;
}

function renderProfiles() {
  const list = qs("profilesList");
  list.innerHTML = "";

  if (!savedProfiles.length) {
    list.innerHTML = '<div class="muted">Nenhum profile salvo.</div>';
  } else {
    savedProfiles.forEach((profile) => {
      const item = document.createElement("div");
      item.className = `profile-item ${profile.id === selectedProfileId ? "active" : ""}`;
      item.innerHTML =
        `<div class="title">${profile.name}</div>` +
        `<div class="meta">${profileKeywordsSummary(profile)}</div>`;
      item.addEventListener("click", () => {
        selectProfile(profile.id, true);
      });
      list.appendChild(item);
    });
  }

  const select = qs("monitorProfileSelect");
  const previous = select.value;
  select.innerHTML = '<option value="">Selecione um profile</option>';
  savedProfiles.forEach((profile) => {
    const opt = document.createElement("option");
    opt.value = profile.id;
    opt.textContent = profile.name;
    select.appendChild(opt);
  });
  select.value = selectedProfileId || previous || "";

  const badge = qs("activeProfileBadge");
  const selected = getProfileById(selectedProfileId);
  badge.textContent = selected ? `ativo: ${selected.name}` : "nenhum selecionado";
  renderLeads();
}

function selectProfile(profileId, syncMonitorFields) {
  selectedProfileId = profileId || "";
  const profile = getProfileById(selectedProfileId);

  if (profile) {
    qs("profileEditorName").value = profile.name;
    qs("profileEditorPositive").value = (profile.positiveKeywords || []).join(", ");
    qs("profileEditorNegative").value = (profile.negativeKeywords || []).join(", ");
    qs("profileEditorMin").value = String(profile.minMinutes || 3);
    qs("profileEditorMax").value = String(profile.maxMinutes || 7);

    if (syncMonitorFields) void persistMonitorConfigFromUi();
  } else {
    qs("profileEditorMin").value = "3";
    qs("profileEditorMax").value = "7";
  }

  renderProfiles();
  updateMonitorProfilePreview();
  updateProfileKeywordPreview();
}

async function loadProfiles() {
  const data = await chrome.storage.local.get([STORAGE_PROFILES_KEY]);
  savedProfiles = Array.isArray(data?.[STORAGE_PROFILES_KEY])
    ? data[STORAGE_PROFILES_KEY]
    : [];
  renderProfiles();
}

function setupProfileActions() {
  qs("btnNewProfile").addEventListener("click", () => {
    selectedProfileId = "";
    qs("profileEditorName").value = "";
    qs("profileEditorPositive").value = "";
    qs("profileEditorNegative").value = "";
    qs("profileEditorMin").value = "3";
    qs("profileEditorMax").value = "7";
    renderProfiles();
    updateMonitorProfilePreview();
    updateProfileKeywordPreview();
  });

  qs("btnSaveProfile").addEventListener("click", async () => {
    const name = qs("profileEditorName").value.trim();
    if (!name) {
      appendLog("logGeneral", "Informe um nome para o profile.", "warn");
      return;
    }

    const positiveKeywords = parseKeywordsInput(qs("profileEditorPositive").value);
    const negativeKeywords = parseKeywordsInput(qs("profileEditorNegative").value);
    const minMinutes = Number(qs("profileEditorMin").value) || 3;
    const maxMinutes = Number(qs("profileEditorMax").value) || 7;
    if (maxMinutes < minMinutes) {
      appendLog("logGeneral", "Intervalo do profile inválido (max < min).", "err");
      return;
    }

    if (selectedProfileId) {
      const idx = savedProfiles.findIndex((p) => p.id === selectedProfileId);
      if (idx >= 0) {
        savedProfiles[idx] = {
          ...savedProfiles[idx],
          name,
          positiveKeywords,
          negativeKeywords,
          minMinutes,
          maxMinutes,
        };
      }
    } else {
      selectedProfileId = `${Date.now()}`;
      savedProfiles.push({
        id: selectedProfileId,
        name,
        positiveKeywords,
        negativeKeywords,
        minMinutes,
        maxMinutes,
      });
    }

    await persistProfiles();
    selectProfile(selectedProfileId, true);
    appendLog("logGeneral", "✅ Profile salvo com sucesso.", "ok");
  });

  qs("btnDeleteProfile").addEventListener("click", async () => {
    if (!selectedProfileId) {
      appendLog("logGeneral", "Selecione um profile para excluir.", "warn");
      return;
    }

    savedProfiles = savedProfiles.filter((p) => p.id !== selectedProfileId);
    selectedProfileId = "";
    qs("profileEditorName").value = "";
    qs("profileEditorPositive").value = "";
    qs("profileEditorNegative").value = "";
    qs("profileEditorMin").value = "3";
    qs("profileEditorMax").value = "7";
    await persistProfiles();
    renderProfiles();
    updateMonitorProfilePreview();
    updateProfileKeywordPreview();
    await persistMonitorConfigFromUi();
    appendLog("logGeneral", "🗑️ Profile removido.", "warn");
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
    appendLog("logGeneral", `grupos carregados até agora: ${message.count}`, "info");
  }

  if (message?.type === "groupsChunk") {
    const hasSkeleton = !!qs("groupsList").querySelector(".group-card.skeleton");
    if (hasSkeleton) qs("groupsList").innerHTML = "";
    const chunk = Array.isArray(message.groups) ? message.groups : [];
    chunk.forEach((g) => {
      const key = String(g.id);
      lastLoadedGroups.set(key, g);
      upsertGroupCard(g);
    });
    qs("groupCount").textContent = `${message.count || lastLoadedGroups.size} grupo(s)`;
    updateSelectedGroupCount();
    applyGroupsVisibilityFilter();
    void persistLoadedGroups();
  }

  if (message?.type === "groupsStreamDone") {
    setGroupFetchState(false);
    if (message.success) {
      appendLog(
        "logGeneral",
        `✅ Busca de grupos finalizada${message.stopped ? " (interrompida)" : ""}. Total: ${message.total || lastLoadedGroups.size}`,
        "ok",
      );
    } else {
      appendLog("logGeneral", `❌ groupsStream falhou: ${message.error}`, "err");
    }
  }

  if (message?.type === "monitorState") {
    setMonitorState(!!message.running, message.running ? "escutando..." : "parado");
    if (!message.running) appendLog("logPosts", "🛑 Escuta parada.", "warn");
  }

  if (message?.type === "monitorTick") {
    if (message.phase === "start") {
      appendLog("logGeneral", message.message || "Ciclo iniciado.", "info");
      qs("monitorNextRun").textContent = "checando agora...";
      return;
    }
    const mins = Math.round((Number(message.nextDelayMs) || 0) / 60000);
    qs("monitorNextRun").textContent = `próxima checagem: ~${mins} min`;
    if (message.warmup) {
      appendLog("logPosts", `⏱️ Warmup concluído. Próxima checagem em ~${mins} min`, "info");
    } else {
      appendLog(
        "logPosts",
        `⏱️ Checados ${message.polledCount} posts, ${message.matchedCount} matches. Próxima em ~${mins} min`,
        "info",
      );
    }
  }

  if (message?.type === "monitorMatches") {
    const matches = Array.isArray(message.matches) ? message.matches : [];
    if (!matches.length) return;
    appendLog(
      "logPosts",
      `🔔 ${matches.length} novo(s) match(es)${message.profileName ? ` [${message.profileName}]` : ""}`,
      "ok",
    );
    matches.slice(0, 10).forEach((p) => {
      const txt = (p.post_text || p.marketplace_text || "").slice(0, 110);
      appendLog("logPosts", `  → ${p.group_name} | ${p.poster_name}: ${txt}`, "info");
    });
    void refreshLeadsHistory();
  }

  if (message?.type === "monitorRawPosts") {
    const posts = Array.isArray(message.posts) ? message.posts : [];
    appendLog(
      "logPosts",
      `📥 Debug ciclo: ${posts.length} post(s) capturado(s)${message.profileName ? ` [${message.profileName}]` : ""}`,
      "info",
    );

    posts.forEach((p) => {
      const txt = (p.post_text || p.marketplace_text || "").replace(/\s+/g, " ").trim();
      const snippet = txt ? txt.slice(0, 120) : "(sem texto)";
      appendLog(
        "logPosts",
        `  • ${p.group_name || "Grupo"} | ${p.poster_name || "Pessoa"} | ${p.post_type || "post"} | ${snippet}`,
        "info",
      );
    });
  }

  if (message?.type === "monitorError") {
    appendLog("logPosts", `❌ Erro no monitor: ${message.error}`, "err");
  }

  if (message?.type === "take_profiles") {
    if (message.good) {
      const posts = Array.isArray(message.latest_posts) ? message.latest_posts : [];
      const filteredPosts =
        selectedGroupIds.size > 0
          ? posts.filter((p) => selectedGroupIds.has(String(p.group_id)))
          : posts;

      appendLog(
        "logPosts",
        `✅ ${posts.length} posts recebidos (${filteredPosts.length} em grupos selecionados)` ,
        "ok",
      );

      if (filteredPosts.length) {
        filteredPosts.slice(0, 8).forEach((p) => {
          const txt = (p.post_text || p.marketplace_text || "").slice(0, 100);
          appendLog("logPosts", `🔔 [${p.post_type}] ${p.poster_name} em ${p.group_name}: ${txt}`, "info");
        });
      } else {
        appendLog("logPosts", "Nenhum post novo dos grupos selecionados.", "warn");
      }
    } else {
      appendLog("logPosts", `❌ Erro: ${message.error_msg}`, "err");
    }
    setButtonLoading("btnGetPosts", false);
  }
});

qsa(".btn").forEach((btn) => {
  btn.dataset.label = btn.textContent;
});

setupTabs();
setupProfileActions();

chrome.runtime.sendMessage({ type: "checkLogin" }, (response) => {
  if (response?.loggedIn) {
    setLoginStatus(true, `Logado: ${response.userId}`);
    appendLog("logAuth", `✅ Logado como userId=${response.userId}`, "ok");
  } else {
    setLoginStatus(false, "Não logado");
    appendLog("logAuth", "❌ Não logado no Facebook", "err");
  }
});

qs("btnCheckLogin").addEventListener("click", () => {
  setButtonLoading("btnCheckLogin", true);
  chrome.runtime.sendMessage({ type: "checkLogin" }, (response) => {
    setButtonLoading("btnCheckLogin", false);
    if (response?.loggedIn) {
      setLoginStatus(true, `Logado: ${response.userId}`);
      appendLog("logAuth", `✅ userId=${response.userId}`, "ok");
    } else {
      setLoginStatus(false, "Não logado");
      appendLog("logAuth", "❌ Não logado", "err");
    }
  });
});

qs("btnGetToken").addEventListener("click", async () => {
  setButtonLoading("btnGetToken", true);
  appendLog("logAuth", "Buscando fb_dtsg...", "info");
  try {
    const html = await fetchFacebookSettingsHtml();
    const match = html.match(
      /"DTSGInitialData",\s*\[[^\]]*\],\s*\{[^{}]*"token"\s*:\s*"([^"]+)"[^{}]*\}/,
    );
    if (match?.[1]) appendLog("logAuth", `✅ fb_dtsg: ${match[1].substring(0, 30)}...`, "ok");
    else appendLog("logAuth", "❌ token não encontrado — está logado no Facebook?", "err");
  } catch (e) {
    appendLog("logAuth", `❌ Erro: ${e?.message || String(e)}`, "err");
  }
  setButtonLoading("btnGetToken", false);
});

qs("btnGetAllTokens").addEventListener("click", async () => {
  setButtonLoading("btnGetAllTokens", true);
  appendLog("logAuth", "Buscando todos os tokens...", "info");
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
      if (v) appendLog("logAuth", `✅ ${k}: ${String(v).substring(0, 40)}`, "ok");
      else appendLog("logAuth", `❌ ${k}: não encontrado`, "err");
    });
  } catch (e) {
    appendLog("logAuth", `❌ Erro: ${e?.message || String(e)}`, "err");
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
      appendLog("logGeneral", `✅ Data de criação: ${response.creationDate}`, "ok");
    } else {
      el.style.display = "none";
      appendLog("logGeneral", "❌ Não foi possível obter data de criação", "err");
    }
  });
});

qs("btnGetGroups").addEventListener("click", () => {
  setGroupFetchState(true);
  renderGroupsLoadingSkeleton();
  lastLoadedGroups.clear();
  void chrome.storage.local.set({ [STORAGE_LOADED_GROUPS_KEY]: [] });
  qs("groupCount").textContent = "buscando...";

  chrome.runtime.sendMessage({ type: "startGroupsStream" }, (response) => {
    if (!response?.success) {
      setGroupFetchState(false);
      qs("groupCount").textContent = "erro";
      appendLog("logGeneral", `❌ startGroupsStream falhou: ${response?.error}`, "err");
    }
  });
});

qs("btnStopGroups").addEventListener("click", () => {
  if (!isGroupFetchRunning) return;
  chrome.runtime.sendMessage({ type: "stopGroupsStream" }, () => {
    appendLog("logGeneral", "⏹️ Parada da busca solicitada...", "warn");
  });
});

qs("btnSelectAllGroups").addEventListener("click", async () => {
  if (!lastLoadedGroups.size) {
    appendLog("logGeneral", "Busque os grupos antes de selecionar.", "warn");
    return;
  }
  for (const g of lastLoadedGroups.values()) selectedGroupIds.add(String(g.id));
  await persistSelectedGroupIds();
  qsa(".group-select").forEach((el) => {
    el.checked = true;
    const card = el.closest(".group-card");
    if (card) card.classList.add("selected");
  });
  appendLog("logGeneral", "Seleção salva: todos os grupos marcados.", "ok");
});

qs("btnClearGroupSelection").addEventListener("click", async () => {
  selectedGroupIds.clear();
  await persistSelectedGroupIds();
  qsa(".group-select").forEach((el) => {
    el.checked = false;
    const card = el.closest(".group-card");
    if (card) card.classList.remove("selected");
  });
  appendLog("logGeneral", "Seleção limpa.", "warn");
});

qs("btnStartMonitor").addEventListener("click", async () => {
  if (!selectedProfileId) {
    appendLog("logPosts", "Selecione um profile para iniciar a escuta.", "warn");
    return;
  }
  if (!getProfileById(selectedProfileId)) {
    appendLog("logPosts", "Profile selecionado não existe mais. Escolha outro.", "err");
    return;
  }

  if (selectedGroupIds.size === 0) {
    appendLog("logPosts", "Selecione ao menos 1 grupo antes de iniciar a escuta.", "warn");
    return;
  }

  const payload = resolveMonitorPayload();

  await persistMonitorConfigFromUi();
  setMonitorState(true, "iniciando...");

  chrome.runtime.sendMessage({ type: "startPostMonitor", payload }, (response) => {
    if (!response?.success) {
      setMonitorState(false, "parado");
      appendLog(
        "logPosts",
        `❌ Falha ao iniciar escuta: ${response?.error || "desconhecido"}`,
        "err",
      );
      return;
    }
    appendLog("logPosts", "✅ Escuta iniciada.", "ok");
  });
});

qs("btnStopMonitor").addEventListener("click", () => {
  if (!isMonitorRunning) return;
  chrome.runtime.sendMessage({ type: "stopPostMonitor" }, () => {
    setMonitorState(false, "parado");
  });
});

qs("groupsOnlySelected").addEventListener("change", () => {
  applyGroupsVisibilityFilter();
});

["leadsProfileFilter", "leadsTextFilter", "leadsOnlySelectedGroups"].forEach((id) => {
  qs(id).addEventListener("input", () => {
    renderLeads();
  });
  qs(id).addEventListener("change", () => {
    renderLeads();
  });
});

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
  await loadSelectedGroupIds();
  await loadMonitorConfigToUi();
  await loadProfiles();
  await loadPersistedGroups();
  await refreshLeadsHistory();
  updateMonitorProfilePreview();
  updateProfileKeywordPreview();

  if (selectedProfileId && getProfileById(selectedProfileId)) {
    selectProfile(selectedProfileId, true);
  }

  chrome.runtime.sendMessage({ type: "getPostMonitorState" }, (response) => {
    if (response?.success) {
      setMonitorState(!!response.running, response.running ? "escutando..." : "parado");
    } else {
      setMonitorState(false, "parado");
    }
  });
})();
