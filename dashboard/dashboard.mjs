import { signOut } from "../lib/supabaseAuth.mjs";
import { normalizeKeywords } from "../lib/profiles.mjs";
import {
  listCrmLeads,
  upsertCrmLead,
  patchCrmLead,
  clearCrmLeads,
  exportCrmLeadsCsv,
} from "../lib/db.mjs";

import { initI18n, setLang, tFactory, applyDomI18n } from "../lib/i18n.mjs";

const send = (msg) =>
  new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

let activeProfileId = "default";
let extensionEnabled = true;

// i18n
let LANG = "pt-BR";
let t = (k) => k;

// pagination
let leadsPage = 0;
const LEADS_PAGE_SIZE = 10;

function qs(id) {
  return document.getElementById(id);
}

async function bootI18n() {
  const { lang } = await initI18n();
  LANG = lang;
  t = tFactory(LANG);

  document.documentElement.setAttribute("lang", LANG);
  applyDomI18n(t);

  const sel = qs("langSelect");
  const sel2 = qs("langSelectModal");
  if (sel) sel.value = LANG;
  if (sel2) sel2.value = LANG;

  const onChange = async (v) => {
    const nl = await setLang(v);
    LANG = nl;
    t = tFactory(LANG);
    document.documentElement.setAttribute("lang", LANG);
    applyDomI18n(t);

    // Re-render partes que são geradas via JS
    await loadProfiles();
    await loadGroups();
    await loadLeads();
  };

  sel?.addEventListener("change", () => onChange(sel.value));
  sel2?.addEventListener("change", () => onChange(sel2.value));
}

function slugifyId(name) {
  const s = String(name || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  return s || "perfil";
}

function computeProfileId() {
  const name = qs("p_name")?.value?.trim() || "";
  const base = slugifyId(name);
  return `p_${base}`;
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderKwPreview(list, elId, countId, kind /* "inc" | "exc" */) {
  const el = qs(elId);
  const ct = qs(countId);
  const arr = Array.isArray(list) ? list : [];

  if (ct) ct.textContent = String(arr.length);

  if (!el) return;
  if (!arr.length) {
    el.innerHTML = `<span class="small">${escapeHtml(
      // mantém simples (sem chave dedicada)
      LANG === "en"
        ? "Nothing yet. Separate by comma."
        : LANG === "es"
          ? "Aún nada. Separa por coma."
          : "Nada ainda. Separe por vírgula.",
    )}</span>`;
    return;
  }

  const cls = kind === "exc" ? "kwChip kwChipExc" : "kwChip kwChipInc";
  el.innerHTML = arr
    .slice(0, 30)
    .map(
      (k) =>
        `<span class="${cls}"><small>${kind === "exc" ? "IGN" : "OK"}</small> ${escapeHtml(k)}</span>`,
    )
    .join("");
}

function syncProfileEditorUI() {
  const id = computeProfileId();
  const inc = normalizeKeywords(qs("p_include")?.value || "");
  const exc = normalizeKeywords(qs("p_exclude")?.value || "");

  const idEl = qs("p_idPreview");
  if (idEl) idEl.textContent = id;

  renderKwPreview(inc, "p_incPreview", "p_incCount", "inc");
  renderKwPreview(exc, "p_excPreview", "p_excCount", "exc");
}

function safeAuthorName(a) {
  const tt = String(a || "").trim();
  return tt
    ? tt
    : LANG === "en"
      ? "Anonymous"
      : LANG === "es"
        ? "Anónimo"
        : "Anônimo";
}

function setTab(tab) {
  const map = {
    leads: qs("viewLeads"),
    groups: qs("viewGroups"),
    profiles: qs("viewProfiles"),
  };

  Object.values(map).forEach((el) => (el.style.display = "none"));
  map[tab].style.display = "block";

  ["tabLeads", "tabGroups", "tabProfiles"].forEach((id) =>
    qs(id)?.classList.remove("active"),
  );
  if (tab === "leads") qs("tabLeads")?.classList.add("active");
  if (tab === "groups") qs("tabGroups")?.classList.add("active");
  if (tab === "profiles") qs("tabProfiles")?.classList.add("active");

  map[tab].classList.remove("viewEnter");
  void map[tab].offsetWidth;
  map[tab].classList.add("viewEnter");
}

async function refreshAutorunUI() {
  const r = await send({ type: "AUTORUN_STATUS" });
  const dot = qs("autorunDot");
  const text = qs("autorunText");

  if (!r?.ok) {
    dot.className = "dot off";
    text.textContent =
      LANG === "en"
        ? "Monitoring: error"
        : LANG === "es"
          ? "Monitoreo: error"
          : "Monitoramento: erro";
    qs("mAutorun").textContent = "—";
    return;
  }

  const on = !!r.state.running;
  dot.className = on ? "dot on" : "dot off";
  text.textContent = on
    ? LANG === "en"
      ? "Monitoring: ON"
      : LANG === "es"
        ? "Monitoreo: ON"
        : "Monitoramento: ON"
    : LANG === "en"
      ? "Monitoring: OFF"
      : LANG === "es"
        ? "Monitoreo: OFF"
        : "Monitoramento: OFF";
  qs("mAutorun").textContent = on ? "ON" : "OFF";
}

async function refreshExtensionUI() {
  const r = await send({ type: "SETTINGS_GET" });
  if (!r?.ok) {
    extensionEnabled = true;
    return;
  }

  const enabled =
    typeof r.settings?.enabled === "boolean"
      ? r.settings.enabled
      : typeof r.settings?.extensionEnabled === "boolean"
        ? r.settings.extensionEnabled
        : true;

  extensionEnabled = enabled;
}

async function toggleAutorun() {
  const r = await send({ type: "AUTORUN_STATUS" });
  if (!r?.ok) return;

  if (!extensionEnabled && !r.state.running) return;

  if (r.state.running) await send({ type: "AUTORUN_STOP" });
  else await send({ type: "AUTORUN_START", intervalMs: 60_000 });

  await refreshAutorunUI();
}

// ---------- PROFILE MODAL ----------
function openProfileModal() {
  qs("profileModal").style.display = "grid";
  document.body.style.overflow = "hidden";
}
function closeProfileModal() {
  qs("profileModal").style.display = "none";
  document.body.style.overflow = "";
}

function setMsg(text, type) {
  const el = qs("p_msg");
  if (!el) return;
  el.textContent = text;
  el.className =
    type === "err" ? "notice err" : type === "ok" ? "notice ok" : "notice";
}

function fillForm(p) {
  qs("p_name").value = p?.name || "";
  qs("p_include").value = (p?.include || []).join(", ");
  qs("p_exclude").value = (p?.exclude || []).join(", ");

  qs("editorSub").textContent = p?.id
    ? t("profiles.modal.subEdit", { id: p.id })
    : t("profiles.modal.subNew");
  qs("modalTitle").textContent = p?.id
    ? t("profiles.modal.editTitle")
    : t("profiles.modal.newTitle");

  const idEl = qs("p_idPreview");
  if (idEl) idEl.textContent = p?.id ? p.id : computeProfileId();

  syncProfileEditorUI();

  // manter selects do modal sincronizados
  const sel2 = qs("langSelectModal");
  if (sel2) sel2.value = LANG;
}

function clearForm() {
  fillForm({ id: "", name: "", include: [], exclude: [] });
  setMsg("", "");
}

qs("openProfileModal")?.addEventListener("click", () => {
  fillForm({ id: "", name: "", include: [], exclude: [] });
  openProfileModal();
});
qs("closeProfileModal")?.addEventListener("click", closeProfileModal);
qs("profileModal")?.addEventListener("click", (e) => {
  if (e.target === qs("profileModal")) closeProfileModal();
});

// tabs
qs("tabLeads")?.addEventListener("click", () => setTab("leads"));
qs("tabGroups")?.addEventListener("click", () => setTab("groups"));
qs("tabProfiles")?.addEventListener("click", () => setTab("profiles"));

// autorun
qs("autorunBtn")?.addEventListener("click", toggleAutorun);

// support placeholder
qs("supportBtn")?.addEventListener("click", () => {});

// auth
qs("logoutBtn")?.addEventListener("click", async () => {
  await signOut();
  window.location.href = "../auth/login.html";
});

// empty actions
qs("emptyGoGroups")?.addEventListener("click", () => setTab("groups"));
qs("emptyToggleAutorun")?.addEventListener("click", toggleAutorun);

// refresh
qs("refreshProfiles")?.addEventListener("click", () => loadProfiles());
qs("refreshGroups")?.addEventListener("click", () => loadGroups());
qs("refreshLeads")?.addEventListener("click", () => {
  leadsPage = 0;
  loadLeads();
});

// export
qs("exportCsv")?.addEventListener("click", async () => {
  await exportCrmLeadsCsv();
});

// clear
qs("clearLeads")?.addEventListener("click", async () => {
  await chrome.storage.local.set({ leads: [] });
  await clearCrmLeads();
  leadsPage = 0;
  await loadLeads();
  drawLeadsChart([]);
});

// pager
qs("leadsPrev")?.addEventListener("click", async () => {
  leadsPage = Math.max(0, leadsPage - 1);
  await loadLeads();
});
qs("leadsNext")?.addEventListener("click", async () => {
  leadsPage = leadsPage + 1;
  await loadLeads();
});

// ---------- PROFILE FORM ----------
qs("clearForm")?.addEventListener("click", clearForm);
["p_name", "p_include", "p_exclude"].forEach((id) => {
  qs(id)?.addEventListener("input", () => syncProfileEditorUI());
});

qs("saveProfile")?.addEventListener("click", async () => {
  const name = qs("p_name").value.trim();
  const include = normalizeKeywords(qs("p_include").value);
  const exclude = normalizeKeywords(qs("p_exclude").value);

  if (!name) {
    setMsg(t("profiles.msg.fillName"), "err");
    return;
  }

  const currentShownId = (qs("p_idPreview")?.textContent || "").trim();
  const id =
    currentShownId && currentShownId !== "—"
      ? currentShownId
      : computeProfileId();
  const profile = { id, name, include, exclude };

  const r = await send({ type: "PROFILES_UPSERT", profile });
  if (!r?.ok) {
    setMsg(t("profiles.msg.saveErr"), "err");
    return;
  }

  setMsg(t("profiles.msg.saved"), "ok");
  await loadProfiles();
});

qs("useThisProfile")?.addEventListener("click", async () => {
  const id = (qs("p_idPreview")?.textContent || "").trim();
  if (!id || id === "—") {
    setMsg(t("profiles.msg.needNameForId"), "err");
    return;
  }

  const r = await send({ type: "SETTINGS_SET_ACTIVE_PROFILE", profileId: id });
  if (!r?.ok) {
    setMsg(t("profiles.msg.activateErr"), "err");
    return;
  }

  await loadProfiles();
  setMsg(t("profiles.msg.activeNow", { id }), "ok");
});

// ---------- CARDS ----------
function profileCard(p) {
  const isDefault = ["default", "psicologo", "designer"].includes(p.id);
  const isActive = p.id === activeProfileId;

  const badges = `
    <div class="badges">
      ${isDefault ? `<span class="badge badge-amber">${escapeHtml(t("badge.base"))}</span>` : ``}
      ${isActive ? `<span class="badge badge-primary">${escapeHtml(LANG === "en" ? "Active" : LANG === "es" ? "Activo" : "Ativo")}</span>` : ``}
      <span class="badge badge-muted">${p.include?.length || 0} ${escapeHtml(LANG === "en" ? "find" : LANG === "es" ? "buscar" : "procurar")}</span>
      <span class="badge badge-muted">${p.exclude?.length || 0} ${escapeHtml(LANG === "en" ? "ignore" : LANG === "es" ? "ignorar" : "ignorar")}</span>
    </div>
  `;

  const kws = (p.include || [])
    .slice(0, 10)
    .map((k) => `<span class="kw">${escapeHtml(k)}</span>`)
    .join("");
  const kws2 = (p.exclude || [])
    .slice(0, 8)
    .map((k) => `<span class="kw neg">${escapeHtml(k)}</span>`)
    .join("");

  return `
    <div class="card">
      <div class="card-top">
        <div style="min-width:0;">
          <div class="card-title">${escapeHtml(p.name)}</div>
          <div class="card-meta">${escapeHtml(p.id)}</div>
        </div>
        ${badges}
      </div>

      <div class="kws">${kws}${kws2}</div>

      <div class="card-actions">
        <button class="btn btn-primary act-use" data-id="${escapeHtml(p.id)}" type="button">${escapeHtml(t("btn.use"))}</button>
        <button class="btn btn-ghost act-edit" data-id="${escapeHtml(p.id)}" type="button">${escapeHtml(t("btn.edit"))}</button>
        <button class="btn btn-danger act-del" data-id="${escapeHtml(p.id)}" type="button" ${p.id === "default" ? "disabled" : ""}>${escapeHtml(t("btn.delete"))}</button>
      </div>
    </div>
  `;
}

function groupCard(g) {
  const badge = g.enabled
    ? `<span class="badge badge-primary">${escapeHtml(t("badge.active"))}</span>`
    : `<span class="badge badge-muted">${escapeHtml(t("badge.inactive"))}</span>`;

  return `
    <div class="card">
      <div class="card-top">
        <div style="min-width:0;">
          <div class="card-title">${escapeHtml(g.slug)}</div>
          <div class="card-meta truncate">${escapeHtml(g.url)}</div>
        </div>
        <div class="badges">${badge}</div>
      </div>

      <div class="card-actions">
        <button class="btn btn-primary act-open-group" data-url="${escapeHtml(g.url)}" type="button">${escapeHtml(t("btn.open"))}</button>
        <button class="btn btn-danger act-remove-group" data-slug="${escapeHtml(g.slug)}" type="button">${escapeHtml(t("btn.delete"))}</button>
      </div>
    </div>
  `;
}

function statusLabel(s) {
  if (s === "new") return t("st.new");
  if (s === "contacted") return t("st.contacted");
  if (s === "followup") return t("st.followup");
  if (s === "closed") return t("st.closed");
  if (s === "ignored") return t("st.ignored");
  return t("st.new");
}

function statusBadgeClass(s) {
  if (s === "new") return "badge badge-primary";
  if (s === "contacted") return "badge badge-blue";
  if (s === "followup") return "badge badge-amber";
  if (s === "closed") return "badge badge-green";
  if (s === "ignored") return "badge badge-muted";
  return "badge badge-primary";
}

function leadKeyFrom(l) {
  const post = l.post || {};
  return (
    post.postUrl ||
    post.url ||
    `${safeAuthorName(post.autor) === (LANG === "en" ? "Anonymous" : LANG === "es" ? "Anónimo" : "Anônimo") ? "anon" : post.autor}::${l.timestamp || 0}::${l.slug || "nogroup"}`
  );
}

async function ensureCrmFromRawLeads(rawLeads) {
  for (const l of rawLeads || []) {
    const post = l.post || {};
    const key = leadKeyFrom(l);

    await upsertCrmLead({
      id: key,
      origin: "facebook",
      author: safeAuthorName(post.autor),
      authorUrl: post.autorUrl || "",
      postUrl: post.postUrl || post.url || "",
      groupUrl: l.groupUrl || "",
      groupSlug: l.slug || "",
      profileName: l.profileName || "",
      text: post.texto || "",
      createdAt: l.timestamp || Date.now(),
    });
  }
}

function leadCardMerged(raw, meta) {
  const post = raw.post || {};
  const key = leadKeyFrom(raw);
  const when = new Date(raw.timestamp || Date.now()).toLocaleString();
  const who = safeAuthorName(post.autor);
  const txt = String(post.texto || "");

  const postUrl = post.postUrl || post.url || "";
  const autorUrl = post.autorUrl || "";
  const groupUrl = raw.groupUrl || "";

  const st = meta?.status || "new";
  const note = meta?.notes || "";

  const chips = `
    <span class="${statusBadgeClass(st)}">${escapeHtml(statusLabel(st))}</span>
    ${raw.profileName ? `<span class="badge badge-muted">${escapeHtml(raw.profileName)}</span>` : ``}
    ${raw.slug ? `<span class="badge badge-amber">${escapeHtml(raw.slug)}</span>` : ``}
  `;

  return `
    <div class="leadCard" data-id="${escapeHtml(key)}">
      <div class="leadHead">
        <div class="leadIdentity">
          <div class="leadTitle">${escapeHtml(who)}</div>
          <div class="leadMeta">${escapeHtml(when)}</div>
        </div>
        <div class="leadChips">${chips}</div>
      </div>

      <div class="leadBody">
        <div class="leadTextClamp" id="leadText_${escapeHtml(key)}">${escapeHtml(txt)}</div>
        <div class="leadBodyActions">
          <button class="btn btn-ghost btn-xs leadToggle" data-id="${escapeHtml(key)}" type="button">
            ${escapeHtml(t("leads.seeMore"))}
          </button>
        </div>
      </div>

      <div class="leadFoot">
        <div class="leadLinks">
          <button class="btn btn-primary btn-sm act-open-post" data-url="${escapeHtml(postUrl)}" type="button" ${postUrl ? "" : "disabled"}>
            ${escapeHtml(t("leads.link.post"))}
          </button>
          <button class="btn btn-link btn-sm act-open-profile" data-url="${escapeHtml(autorUrl)}" type="button" ${autorUrl ? "" : "disabled"}>
            ${escapeHtml(t("leads.link.profile"))}
          </button>
          <button class="btn btn-link btn-sm act-open-group" data-url="${escapeHtml(groupUrl)}" type="button" ${groupUrl ? "" : "disabled"}>
            ${escapeHtml(t("leads.link.group"))}
          </button>
        </div>

        <div class="leadCrmGrid">
          <div class="crmField">
            <div class="crmLabel">${escapeHtml(t("leads.crm.status"))}</div>
            <select class="select select-sm crmStatus" data-id="${escapeHtml(key)}" data-i18n-aria="leads.crm.status" aria-label="${escapeHtml(t("leads.crm.status"))}">
              <option value="new" ${st === "new" ? "selected" : ""}>${escapeHtml(t("st.new"))}</option>
              <option value="contacted" ${st === "contacted" ? "selected" : ""}>${escapeHtml(t("st.contacted"))}</option>
              <option value="followup" ${st === "followup" ? "selected" : ""}>${escapeHtml(t("st.followup"))}</option>
              <option value="closed" ${st === "closed" ? "selected" : ""}>${escapeHtml(t("st.closed"))}</option>
              <option value="ignored" ${st === "ignored" ? "selected" : ""}>${escapeHtml(t("st.ignored"))}</option>
            </select>
          </div>

          <div class="crmField">
            <div class="crmLabel">${escapeHtml(t("leads.crm.note"))}</div>
            <input
              class="input input-sm crmNote"
              data-id="${escapeHtml(key)}"
              placeholder="${escapeHtml(t("leads.crm.notePh"))}"
              value="${escapeHtml(note)}"
            />
          </div>

          <div class="crmField crmSave">
            <div class="crmLabel">&nbsp;</div>
            <span class="savePill savePill-idle" id="save_${escapeHtml(key)}" aria-live="polite">${escapeHtml(t("save.idle"))}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ---------- LOADERS ----------
async function loadProfiles() {
  const s = await send({ type: "SETTINGS_GET" });
  const p = await send({ type: "PROFILES_LIST" });

  if (!s?.ok || !p?.ok) {
    qs("profilesList").innerHTML = `<div class="card"><div class="notice err">${
      LANG === "en"
        ? "Failed to load profiles"
        : LANG === "es"
          ? "Error al cargar perfiles"
          : "Erro ao carregar perfis"
    }</div></div>`;
    return;
  }

  activeProfileId = s.settings.activeProfileId || "default";
  qs("mActiveProfile").textContent = activeProfileId;

  qs("profilesList").innerHTML = p.profiles.map(profileCard).join("");

  document.querySelectorAll(".act-use").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-id");
      await send({ type: "SETTINGS_SET_ACTIVE_PROFILE", profileId: id });
      await loadProfiles();
    });
  });

  document.querySelectorAll(".act-edit").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-id");
      const r = await send({ type: "PROFILES_GET", id });
      if (r?.ok && r.profile) {
        fillForm(r.profile);
        openProfileModal();
      }
    });
  });

  document.querySelectorAll(".act-del").forEach((b) => {
    b.addEventListener("click", async () => {
      const id = b.getAttribute("data-id");
      const r = await send({ type: "PROFILES_REMOVE", id });
      if (r?.ok) await loadProfiles();
    });
  });
}

async function loadGroups() {
  const res = await send({ type: "DB_LIST_GROUPS" });
  if (!res?.ok) {
    qs("groupsList").innerHTML = `<div class="card"><div class="notice err">${
      LANG === "en"
        ? "Failed to load groups"
        : LANG === "es"
          ? "Error al cargar grupos"
          : "Erro ao carregar grupos"
    }</div></div>`;
    qs("groupsEmpty").style.display = "none";
    return;
  }

  const groups = (res.groups || []).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  );
  const activeCount = groups.filter((g) => g.enabled).length;

  qs("limitText").textContent = `${activeCount} / 10`;
  qs("mGroupsActive").textContent = `${activeCount}`;

  const isEmpty = groups.length === 0;
  qs("groupsEmpty").style.display = isEmpty ? "block" : "none";
  qs("groupsList").innerHTML = isEmpty ? "" : groups.map(groupCard).join("");

  document.querySelectorAll(".act-remove-group").forEach((b) => {
    b.addEventListener("click", async () => {
      const slug = b.getAttribute("data-slug");
      await send({ type: "DB_REMOVE_GROUP", slug });
      await loadGroups();
    });
  });

  document.querySelectorAll(".act-open-group").forEach((b) => {
    b.addEventListener("click", async () => {
      const url = b.getAttribute("data-url");
      if (url) chrome.tabs.create({ url });
    });
  });
}

function leadsTodayCount(leads) {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  return (leads || []).filter((l) => (l.timestamp || 0) >= start).length;
}

function countsLast7Days(leads) {
  const days = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const start = d.getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const count = (leads || []).filter(
      (l) => (l.timestamp || 0) >= start && (l.timestamp || 0) < end,
    ).length;
    days.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, count });
  }
  return days;
}

function drawLeadsChart(leads) {
  const canvas = qs("chartLeads");
  const empty = qs("chartEmpty");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  const cssW = 560;
  const cssH = 160;

  canvas.style.width = "100%";
  canvas.style.height = `${cssH}px`;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const data = countsLast7Days(leads);
  const max = Math.max(1, ...data.map((x) => x.count));
  const sum = data.reduce((a, b) => a + b.count, 0);

  empty.style.display = sum === 0 ? "grid" : "none";
  ctx.clearRect(0, 0, cssW, cssH);

  const padL = 30;
  const padR = 16;
  const padT = 14;
  const padB = 24;

  const plotW = cssW - padL - padR;
  const plotH = cssH - padT - padB;

  const xAt = (i) => padL + (plotW * i) / (data.length - 1);
  const yAt = (v) => padT + plotH - (plotH * v) / max;

  ctx.strokeStyle = "rgba(102,112,133,0.18)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 3; i++) {
    const y = padT + (plotH * i) / 3;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }

  const pts = data.map((d, i) => ({ x: xAt(i), y: yAt(d.count) }));

  ctx.strokeStyle = "rgba(46,166,111,0.18)";
  ctx.lineWidth = 6;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();

  ctx.strokeStyle = "rgba(31,138,88,0.85)";
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();

  pts.forEach((p) => {
    ctx.fillStyle = "rgba(31,138,88,0.85)";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function renderTopGroups(leads) {
  const by = new Map();
  for (const l of leads || []) {
    const url = l.groupUrl || "";
    const slug = l.slug || "";
    if (!url && !slug) continue;
    const key = url || slug;
    by.set(key, (by.get(key) || 0) + 1);
  }

  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  const el = qs("topGroups");
  if (!el) return;

  el.innerHTML = top.length
    ? top
        .map(([key, count]) => {
          const url = String(key || "");
          const hasUrl = url.startsWith("http");
          const slug =
            (hasUrl ? url.match(/\/groups\/([^\/\?\#]+)/) : null)?.[1] ||
            (hasUrl
              ? url.replace(/^https?:\/\/(www\.)?facebook\.com\//, "")
              : url) ||
            "?";

          const openUrl = hasUrl ? url : "";

          return `
            <button class="topGroupRow" type="button" data-url="${escapeHtml(openUrl)}" ${
              openUrl ? "" : "disabled"
            }>
              <div class="tgr-left" style="min-width:0;">
                <div class="tgr-title truncate">${escapeHtml(slug)}</div>
                <div class="tgr-sub truncate">${openUrl ? escapeHtml(openUrl) : escapeHtml(t("top.nolink"))}</div>
              </div>

              <div class="tgr-right">
                <div class="tgr-count">${count}</div>
                <div class="tgr-label">${escapeHtml(t("top.leads"))}</div>
              </div>
            </button>
          `;
        })
        .join("")
    : `<div class="empty" style="margin: 6px 0 0;">
         <div class="empty-title">${escapeHtml(t("top.emptyTitle"))}</div>
         <div class="empty-sub">${escapeHtml(t("top.emptySub"))}</div>
       </div>`;

  document.querySelectorAll(".topGroupRow").forEach((row) => {
    row.addEventListener("click", () => {
      const url = row.getAttribute("data-url");
      if (url) chrome.tabs.create({ url });
    });
  });
}

// ---- CRM autosave (per lead debounce) ----
const saveTimers = new Map();

function setSavePill(id, mode, text) {
  const el = qs(`save_${id}`);
  if (!el) return;
  el.classList.remove(
    "savePill-idle",
    "savePill-saving",
    "savePill-ok",
    "savePill-err",
  );
  el.classList.add(
    mode === "saving"
      ? "savePill-saving"
      : mode === "ok"
        ? "savePill-ok"
        : mode === "err"
          ? "savePill-err"
          : "savePill-idle",
  );
  el.textContent = text || t("save.idle");
}

function scheduleSave(id, patch) {
  const key = String(id || "");
  if (!key) return;

  if (saveTimers.has(key)) clearTimeout(saveTimers.get(key));

  setSavePill(key, "saving", t("save.saving"));

  const tt = setTimeout(async () => {
    try {
      await patchCrmLead(key, patch);
      setSavePill(key, "ok", t("save.ok"));
      setTimeout(() => setSavePill(key, "idle", t("save.idle")), 1200);
    } catch {
      setSavePill(key, "err", t("save.err"));
    }
  }, 450);

  saveTimers.set(key, tt);
}

function bindLeadInteractions() {
  document.querySelectorAll(".leadToggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      const card = btn.closest(".leadCard");
      if (!id || !card) return;
      const expanded = card.classList.toggle("expanded");
      btn.textContent = expanded ? t("leads.seeLess") : t("leads.seeMore");
    });
  });

  document.querySelectorAll(".act-open-post").forEach((b) => {
    b.addEventListener("click", () => {
      const url = b.getAttribute("data-url");
      if (url) chrome.tabs.create({ url });
    });
  });
  document.querySelectorAll(".act-open-profile").forEach((b) => {
    b.addEventListener("click", () => {
      const url = b.getAttribute("data-url");
      if (url) chrome.tabs.create({ url });
    });
  });
  document.querySelectorAll(".act-open-group").forEach((b) => {
    b.addEventListener("click", () => {
      const url = b.getAttribute("data-url");
      if (url) chrome.tabs.create({ url });
    });
  });

  document.querySelectorAll(".crmStatus").forEach((sel) => {
    sel.addEventListener("change", () => {
      const id = sel.getAttribute("data-id");
      scheduleSave(id, { status: sel.value || "new" });
    });
  });

  document.querySelectorAll(".crmNote").forEach((inp) => {
    inp.addEventListener("blur", () => {
      const id = inp.getAttribute("data-id");
      scheduleSave(id, { notes: inp.value || "" });
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        inp.blur();
      }
    });
  });
}

async function loadLeads() {
  const { leads = [] } = await chrome.storage.local.get({ leads: [] });

  await ensureCrmFromRawLeads(leads);

  const crm = await listCrmLeads();
  const metaById = new Map(crm.map((x) => [x.id, x]));

  const sortedRaw = [...leads].sort(
    (a, b) => (b.timestamp || 0) - (a.timestamp || 0),
  );

  qs("mLeadsToday").textContent = `${leadsTodayCount(leads)}`;

  const total = sortedRaw.length;
  const maxPage = Math.max(0, Math.ceil(total / LEADS_PAGE_SIZE) - 1);
  if (leadsPage > maxPage) leadsPage = maxPage;

  const start = leadsPage * LEADS_PAGE_SIZE;
  const end = start + LEADS_PAGE_SIZE;
  const pageItems = sortedRaw.slice(start, end);

  const isEmpty = total === 0;
  qs("leadsEmpty").style.display = isEmpty ? "grid" : "none";

  qs("leadsList").innerHTML = isEmpty
    ? ""
    : pageItems
        .map((raw) => {
          const key = leadKeyFrom(raw);
          return leadCardMerged(raw, metaById.get(key));
        })
        .join("");

  bindLeadInteractions();

  const pager = qs("leadsPager");
  const info = qs("leadsPagerInfo");
  const prev = qs("leadsPrev");
  const next = qs("leadsNext");

  if (pager && info && prev && next) {
    pager.style.display = total > LEADS_PAGE_SIZE ? "flex" : "none";
    info.textContent = t("leads.pagerInfo", {
      a: Math.min(total, start + 1),
      b: Math.min(total, end),
      t: total,
    });
    prev.disabled = leadsPage <= 0;
    next.disabled = leadsPage >= maxPage;
  }

  renderTopGroups(leads);
  drawLeadsChart(leads);
}

// ---------- BOOT ----------
async function boot() {
  await bootI18n();

  const auth = await send({ type: "AUTH_STATUS" });

  if (!auth?.ok || !auth.session?.user) {
    qs("blocked").style.display = "block";
    qs("app").style.display = "none";
    applyDomI18n(t);
    return;
  }

  qs("blocked").style.display = "none";
  qs("app").style.display = "block";

  setTab("leads");

  await refreshExtensionUI();
  await refreshAutorunUI();

  await loadProfiles();
  await loadGroups();
  await loadLeads();
  let leadsReloadT = null;

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (!changes.leads) return;

    clearTimeout(leadsReloadT);
    leadsReloadT = setTimeout(() => {
      leadsPage = 0;
      loadLeads();
    }, 250);
  });

  // garante sincronismo do modal select
  const sel2 = qs("langSelectModal");
  if (sel2) sel2.value = LANG;
}

boot();
