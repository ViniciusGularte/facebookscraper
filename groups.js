const SELECTED_KEY = "selectedGroupIds";
const SAVED_GROUPS_KEY = "savedGroups";

const loadedGroups = new Map();
let selectedIds = new Set();
let isFetching = false;

function qs(id) {
  return document.getElementById(id);
}

function appendLog(text, type = "info") {
  const log = qs("log");
  const line = document.createElement("div");
  line.className = `line ${type}`;
  const time = new Date().toLocaleTimeString();
  line.textContent = `[${time}] ${text}`;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function fallbackImg() {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40">` +
    `<rect width="40" height="40" fill="#1f2937"/>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function updateCounters() {
  qs("countTotal").textContent = `${loadedGroups.size} grupos carregados`;
  qs("countSelected").textContent = `${selectedIds.size} selecionados`;
}

function cardId(groupId) {
  return `group-card-${String(groupId)}`;
}

function setCardSelected(groupId, selected) {
  const el = document.getElementById(cardId(groupId));
  if (!el) return;
  el.classList.toggle("selected", selected);
}

function upsertGroupCard(group) {
  const id = String(group.id);
  let card = document.getElementById(cardId(id));

  if (!card) {
    card = document.createElement("div");
    card.className = "card";
    card.id = cardId(id);
    card.innerHTML =
      `<img alt="Grupo" />` +
      `<div><div class="name"></div><div class="meta"></div></div>`;

    card.addEventListener("click", () => {
      if (selectedIds.has(id)) selectedIds.delete(id);
      else selectedIds.add(id);
      setCardSelected(id, selectedIds.has(id));
      updateCounters();
    });

    qs("groupsGrid").appendChild(card);
  }

  const img = card.querySelector("img");
  img.src = group.image || fallbackImg();
  img.onerror = () => {
    img.src = fallbackImg();
  };

  const name = card.querySelector(".name");
  name.textContent = group.name || "Grupo sem nome";

  const meta = card.querySelector(".meta");
  meta.textContent = `${group.privacy || ""} ${group.members ? `• ${group.members}` : ""}`;

  setCardSelected(id, selectedIds.has(id));
}

async function persistSelection() {
  const selectedArray = Array.from(selectedIds);
  const selectedGroups = selectedArray
    .map((id) => loadedGroups.get(String(id)))
    .filter(Boolean);

  await chrome.storage.local.set({
    [SELECTED_KEY]: selectedArray,
    [SAVED_GROUPS_KEY]: selectedGroups,
  });
}

function setFetchingState(fetching) {
  isFetching = fetching;
  qs("btnStart").disabled = fetching;
  qs("btnStop").disabled = !fetching;
}

function clearLoadedGroups() {
  loadedGroups.clear();
  qs("groupsGrid").innerHTML = "";
  updateCounters();
}

async function startFetch() {
  clearLoadedGroups();
  setFetchingState(true);
  appendLog("Iniciando busca de grupos...", "info");

  chrome.runtime.sendMessage({ type: "startGroupsStream" }, (response) => {
    if (!response?.success) {
      setFetchingState(false);
      appendLog(response?.error || "Falha ao iniciar busca.", "err");
    }
  });
}

function stopFetch() {
  chrome.runtime.sendMessage({ type: "stopGroupsStream" }, () => {});
  appendLog("Parada solicitada...", "info");
}

async function loadStoredSelection() {
  const data = await chrome.storage.local.get([SELECTED_KEY, SAVED_GROUPS_KEY]);
  const ids = Array.isArray(data?.[SELECTED_KEY]) ? data[SELECTED_KEY] : [];
  selectedIds = new Set(ids.map((v) => String(v)));

  const savedGroups = Array.isArray(data?.[SAVED_GROUPS_KEY])
    ? data[SAVED_GROUPS_KEY]
    : [];
  savedGroups.forEach((g) => {
    const id = String(g.id);
    loadedGroups.set(id, g);
    upsertGroupCard(g);
  });
  updateCounters();
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "groupsChunk" && Array.isArray(message.groups)) {
    message.groups.forEach((group) => {
      const id = String(group.id);
      if (!loadedGroups.has(id)) loadedGroups.set(id, group);
      else loadedGroups.set(id, { ...loadedGroups.get(id), ...group });
      upsertGroupCard(loadedGroups.get(id));
    });
    updateCounters();
    return;
  }

  if (message?.type === "groupsStreamDone") {
    setFetchingState(false);
    if (message.success) {
      const suffix = message.stopped ? " (interrompido)" : "";
      appendLog(`Busca finalizada${suffix}. Total: ${message.total || 0}.`, "ok");
    } else {
      appendLog(`Erro na busca: ${message.error || "desconhecido"}`, "err");
    }
  }
});

qs("btnStart").addEventListener("click", startFetch);
qs("btnStop").addEventListener("click", stopFetch);
qs("btnSave").addEventListener("click", async () => {
  await persistSelection();
  appendLog("Selecao salva localmente.", "ok");
});
qs("btnClear").addEventListener("click", async () => {
  selectedIds.clear();
  document.querySelectorAll(".card.selected").forEach((el) => {
    el.classList.remove("selected");
  });
  updateCounters();
  await persistSelection();
  appendLog("Selecao limpa.", "info");
});

void loadStoredSelection();
