import { signOut } from "../lib/supabaseAuth.mjs";
import { normalizeKeywords } from "../lib/profiles.mjs";

const send = (msg) =>
  new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));

let activeProfileId = "default";
let extensionEnabled = true;

function qs(id) {
  return document.getElementById(id);
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setTab(tab) {
  const map = {
    profiles: qs("viewProfiles"),
    groups: qs("viewGroups"),
    leads: qs("viewLeads"),
  };
  Object.values(map).forEach((el) => (el.style.display = "none"));
  map[tab].style.display = "block";

  ["tabProfiles", "tabGroups", "tabLeads"].forEach((id) =>
    qs(id).classList.remove("active"),
  );
  if (tab === "profiles") qs("tabProfiles").classList.add("active");
  if (tab === "groups") qs("tabGroups").classList.add("active");
  if (tab === "leads") qs("tabLeads").classList.add("active");
}

async function refreshAutorunUI() {
  const r = await send({ type: "AUTORUN_STATUS" });
  const dot = qs("autorunDot");
  const text = qs("autorunText");

  if (!r?.ok) {
    dot.className = "dot off";
    text.textContent = "Autorun: erro";
    qs("mAutorun").textContent = "—";
    return;
  }

  const on = !!r.state.running;
  dot.className = on ? "dot on" : "dot off";
  text.textContent = on ? "Autorun: ON" : "Autorun: OFF";
  qs("mAutorun").textContent = on ? "ON" : "OFF";
}

async function refreshExtensionUI() {
  const r = await send({ type: "SETTINGS_GET" });
  const dot = qs("extDot");
  const text = qs("extText");

  if (!r?.ok) {
    dot.className = "dot off";
    text.textContent = "Extensão: erro";
    return;
  }
}

qs("tabProfiles").addEventListener("click", () => setTab("profiles"));
qs("tabGroups").addEventListener("click", () => setTab("groups"));
qs("tabLeads").addEventListener("click", () => setTab("leads"));

qs("refreshProfiles").addEventListener("click", () => loadProfiles());
qs("refreshGroups").addEventListener("click", () => loadGroups());
qs("refreshLeads").addEventListener("click", () => loadLeads());

qs("autorunBtn").addEventListener("click", async () => {
  const r = await send({ type: "AUTORUN_STATUS" });
  if (!r?.ok) return;

  // se extensão estiver OFF, não liga autorun
  if (!extensionEnabled && !r.state.running) return;

  if (r.state.running) await send({ type: "AUTORUN_STOP" });
  else await send({ type: "AUTORUN_START", intervalMs: 60_000 }); // 1 min
  refreshAutorunUI();
});

qs("logoutBtn").addEventListener("click", async () => {
  await signOut();
  window.location.href = "../auth/login.html";
});

qs("clearLeads").addEventListener("click", async () => {
  await chrome.storage.local.set({ leads: [] });
  loadLeads();
});

function setMsg(text, type) {
  const el = qs("p_msg");
  el.textContent = text;
  el.className =
    type === "err" ? "notice err" : type === "ok" ? "notice ok" : "notice";
}

function fillForm(p) {
  qs("p_id").value = p?.id || "";
  qs("p_name").value = p?.name || "";
  qs("p_include").value = (p?.include || []).join(", ");
  qs("p_exclude").value = (p?.exclude || []).join(", ");
  qs("editorSub").textContent = p?.id ? `Editando: ${p.id}` : "Criar / editar";
}

function clearForm() {
  fillForm({ id: "", name: "", include: [], exclude: [] });
  setMsg("", "");
}
qs("clearForm").addEventListener("click", clearForm);

qs("saveProfile").addEventListener("click", async () => {
  const id = qs("p_id").value.trim();
  const name = qs("p_name").value.trim();
  const include = normalizeKeywords(qs("p_include").value);
  const exclude = normalizeKeywords(qs("p_exclude").value);

  if (!id || !name) {
    setMsg("Preencha ID e Nome.", "err");
    return;
  }

  const profile = { id, name, include, exclude };
  const r = await send({ type: "PROFILES_UPSERT", profile });
  if (!r?.ok) {
    setMsg("Erro ao salvar.", "err");
    return;
  }
  setMsg("Salvo.", "ok");
  await loadProfiles();
});

qs("useThisProfile").addEventListener("click", async () => {
  const id = qs("p_id").value.trim();
  if (!id) {
    setMsg("Informe o ID do perfil.", "err");
    return;
  }
  const r = await send({ type: "SETTINGS_SET_ACTIVE_PROFILE", profileId: id });
  if (!r?.ok) {
    setMsg("Erro ao ativar perfil.", "err");
    return;
  }
  await loadProfiles();
  setMsg(`Perfil ativo: ${id}`, "ok");
});

function profileCard(p) {
  const isDefault = ["default", "psicologo", "designer"].includes(p.id);
  const isActive = p.id === activeProfileId;

  const badges = `
    <div class="badges">
      ${isDefault ? `<span class="badge badge-amber">Base</span>` : ``}
      ${isActive ? `<span class="badge badge-blue">Ativo</span>` : ``}
      <span class="badge badge-gray">${p.include?.length || 0} procurar</span>
      <span class="badge badge-gray">${p.exclude?.length || 0} ignorar</span>
    </div>
  `;

  const kws = (p.include || [])
    .slice(0, 8)
    .map((k) => `<span class="kw">${escapeHtml(k)}</span>`)
    .join("");
  const kws2 = (p.exclude || [])
    .slice(0, 6)
    .map((k) => `<span class="kw neg">${escapeHtml(k)}</span>`)
    .join("");

  return `
    <div class="card">
      <div class="card-top">
        <div>
          <div class="card-title">${escapeHtml(p.name)}</div>
          <div class="card-meta">${escapeHtml(p.id)}</div>
        </div>
        ${badges}
      </div>

      <div class="kws">${kws}${kws2}</div>

      <div class="card-actions">
        <button class="btn btn-blue act-use" data-id="${escapeHtml(p.id)}">Usar</button>
        <button class="btn act-edit" data-id="${escapeHtml(p.id)}">Editar</button>
        <button class="btn btn-red act-del" data-id="${escapeHtml(p.id)}" ${p.id === "default" ? "disabled" : ""}>Deletar</button>
      </div>
    </div>
  `;
}

function groupCard(g) {
  const badge = g.enabled
    ? `<span class="badge badge-green">Ativo</span>`
    : `<span class="badge badge-gray">Inativo</span>`;

  return `
    <div class="card">
      <div class="card-top">
        <div>
          <div class="card-title">${escapeHtml(g.slug)}</div>
          <div class="card-meta truncate">${escapeHtml(g.url)}</div>
        </div>
        <div class="badges">${badge}</div>
      </div>

      <div class="card-actions">
        <button class="btn btn-blue act-open-group" data-url="${escapeHtml(g.url)}">Abrir</button>
        <button class="btn btn-red act-remove-group" data-slug="${escapeHtml(g.slug)}">Deletar</button>
      </div>
    </div>
  `;
}
function leadCard(l) {
  const when = new Date(l.timestamp || Date.now()).toLocaleString();
  const post = l.post || {};

  const txt = (post.texto || "").slice(0, 180);
  const who = post.autor || "?";

  const groupUrl = l.groupUrl || "";
  const postUrl = post.postUrl || post.url || "";
  const autorUrl = post.autorUrl || "";

  const chips = `
    <div class="badges">
      <span class="badge badge-blue">Lead</span>
      ${l.profileName ? `<span class="badge badge-gray">${escapeHtml(l.profileName)}</span>` : ``}
      ${l.slug ? `<span class="badge badge-amber">${escapeHtml(l.slug)}</span>` : ``}
    </div>
  `;

  const missing = [];
  if (!postUrl) missing.push("post");
  if (!autorUrl) missing.push("perfil");
  if (!groupUrl) missing.push("grupo");

  const missingLine = missing.length
    ? `<div class="notice" style="margin-top:8px;">Links faltando: ${missing.join(", ")}</div>`
    : ``;

  return `
    <div class="card">
      <div class="card-top">
        <div>
          <div class="card-title">${escapeHtml(who)}</div>
          <div class="card-meta">${escapeHtml(when)}</div>
        </div>
        ${chips}
      </div>

      <div class="notice" style="margin-top:10px;">${escapeHtml(txt)}</div>
      ${missingLine}

      <div class="card-actions">
        <button class="btn btn-blue act-open-post" data-url="${escapeHtml(postUrl)}" ${postUrl ? "" : "disabled"}>
          Abrir post
        </button>

        <button class="btn act-open-profile" data-url="${escapeHtml(autorUrl)}" ${autorUrl ? "" : "disabled"}>
          Abrir perfil
        </button>

        <button class="btn act-open-group" data-url="${escapeHtml(groupUrl)}" ${groupUrl ? "" : "disabled"}>
          Abrir grupo
        </button>
      </div>
    </div>
  `;
}

async function loadProfiles() {
  const s = await send({ type: "SETTINGS_GET" });
  const p = await send({ type: "PROFILES_LIST" });

  if (!s?.ok || !p?.ok) {
    qs("profilesList").innerHTML =
      `<div class="card"><div class="notice err">Erro ao carregar perfis</div></div>`;
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
      if (r?.ok && r.profile) fillForm(r.profile);
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
    qs("groupsList").innerHTML =
      `<div class="card"><div class="notice err">Erro ao carregar grupos</div></div>`;
    return;
  }

  const groups = (res.groups || []).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  );
  const activeCount = groups.filter((g) => g.enabled).length;

  qs("limitText").textContent = `${activeCount} / 10`;
  qs("mGroupsActive").textContent = `${activeCount}`;

  qs("groupsList").innerHTML = groups.length
    ? groups.map(groupCard).join("")
    : `<div class="card"><div class="notice">Nenhum grupo salvo.</div></div>`;

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
      chrome.tabs.create({ url });
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

async function loadLeads() {
  const { leads = [] } = await chrome.storage.local.get({ leads: [] });
  const sorted = [...leads]
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 30);

  qs("mLeadsToday").textContent = `${leadsTodayCount(leads)}`;

  qs("leadsList").innerHTML = sorted.length
    ? sorted.map(leadCard).join("")
    : `<div class="card"><div class="notice">Nenhum lead ainda.</div></div>`;
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

  document.querySelectorAll(".act-open-lead").forEach((b) => {
    b.addEventListener("click", () => {
      const url = b.getAttribute("data-url");
      if (url) chrome.tabs.create({ url });
    });
  });

  renderTopGroups(leads);
}

function renderTopGroups(leads) {
  const by = new Map();
  for (const l of leads || []) {
    const key = l.slug || l.groupUrl || "unknown";
    by.set(key, (by.get(key) || 0) + 1);
  }
  const top = [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  qs("topGroups").innerHTML = top.length
    ? top
        .map(([url, count]) => {
          const slug = (String(url).match(/\/groups\/([^\/\?\#]+)/) || [
            ,
            "?",
          ])[1];
          return `
          <div class="tableRow">
            <div style="min-width:0;">
              <div style="font-weight:900;" class="truncate">${escapeHtml(slug)}</div>
              <div class="small truncate">${escapeHtml(url)}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-weight:900;">${count}</div>
              <div class="small">leads</div>
            </div>
          </div>
        `;
        })
        .join("")
    : `<div class="card"><div class="notice">Sem dados ainda.</div></div>`;
}

async function boot() {
  const auth = await send({ type: "AUTH_STATUS" });

  if (!auth?.ok || !auth.session?.user) {
    qs("blocked").style.display = "block";
    qs("app").style.display = "none";
    return;
  }

  qs("blocked").style.display = "none";
  qs("app").style.display = "block";

  setTab("profiles");
  clearForm();

  await refreshExtensionUI();
  await refreshAutorunUI();

  await loadProfiles();
  await loadGroups();
  await loadLeads();
}

boot();
