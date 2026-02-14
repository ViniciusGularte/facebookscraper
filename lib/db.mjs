import { CONFIG } from "./config.mjs";

const DB_KEY = "db_v1";

function now() {
  return Date.now();
}

function defaultDb() {
  return {
    groups: {},
    leadsCrm: {}, // <-- NOVO: CRM local (status + notas + meta do lead)
    settings: {
      activeProfileId: "default",
    },
  };
}

async function readDb() {
  const { [DB_KEY]: db } = await chrome.storage.local.get(DB_KEY);
  return db ?? defaultDb();
}

async function writeDb(db) {
  await chrome.storage.local.set({ [DB_KEY]: db });
}

// ---------------- GROUPS (seu original) ----------------

export async function listGroups() {
  const db = await readDb();
  return Object.values(db.groups);
}

export async function listEnabledGroups() {
  const db = await readDb();
  return Object.values(db.groups).filter((g) => g.enabled);
}

export async function getGroup(slug) {
  const db = await readDb();
  return db.groups[slug] ?? null;
}

export async function getActiveCount() {
  const db = await readDb();
  return Object.values(db.groups).filter((g) => g.enabled).length;
}

export async function canInjectOrToggle(slug) {
  const existing = await getGroup(slug);
  if (existing) return { allowed: true, existing };

  const activeCount = await getActiveCount();
  return { allowed: activeCount < CONFIG.MAX_ACTIVE_GROUPS, existing: null };
}

export async function enableGroup({ slug, url }) {
  const db = await readDb();
  const existing = db.groups[slug];

  if (existing) {
    db.groups[slug] = { ...existing, url, enabled: true, updatedAt: now() };
    await writeDb(db);
    return db.groups[slug];
  }

  const activeCount = Object.values(db.groups).filter((g) => g.enabled).length;
  if (activeCount >= CONFIG.MAX_ACTIVE_GROUPS) throw new Error("LIMIT_REACHED");

  db.groups[slug] = {
    slug,
    url,
    enabled: true,
    addedAt: now(),
    updatedAt: now(),
  };

  await writeDb(db);
  return db.groups[slug];
}

export async function disableGroup(slug) {
  const db = await readDb();
  const existing = db.groups[slug];
  if (!existing) return null;

  db.groups[slug] = { ...existing, enabled: false, updatedAt: now() };
  await writeDb(db);
  return db.groups[slug];
}

export async function removeGroup(slug) {
  const db = await readDb();
  if (!db.groups[slug]) return false;

  delete db.groups[slug];
  await writeDb(db);
  return true;
}

// ---------------- SETTINGS (seu original) ----------------

export async function getSettings() {
  const db = await readDb();
  return db.settings;
}

export async function setActiveProfileId(profileId) {
  const db = await readDb();
  db.settings.activeProfileId = profileId;
  await writeDb(db);
  return db.settings;
}

// ---------------- CRM LEADS (NOVO) ----------------
// status: new | contacted | followup | closed | ignored

export async function upsertCrmLead(lead) {
  const db = await readDb();
  db.leadsCrm ||= {};

  const id = String(lead?.id || "");
  if (!id) return null;

  const prev = db.leadsCrm[id] || null;

  db.leadsCrm[id] = {
    id,
    origin: lead.origin || prev?.origin || "facebook",

    author: lead.author ?? prev?.author ?? "?",
    authorUrl: lead.authorUrl ?? prev?.authorUrl ?? "",

    postUrl: lead.postUrl ?? prev?.postUrl ?? "",
    groupUrl: lead.groupUrl ?? prev?.groupUrl ?? "",
    groupSlug: lead.groupSlug ?? prev?.groupSlug ?? "",

    profileName: lead.profileName ?? prev?.profileName ?? "",
    text: lead.text ?? prev?.text ?? "",

    status: prev?.status ?? "new",
    notes: prev?.notes ?? "",

    createdAt: lead.createdAt ?? prev?.createdAt ?? now(),
    updatedAt: now(),
  };

  await writeDb(db);
  return db.leadsCrm[id];
}

export async function patchCrmLead(id, patch) {
  const db = await readDb();
  db.leadsCrm ||= {};

  const key = String(id || "");
  if (!key) return null;

  const existing = db.leadsCrm[key];
  if (!existing) return null;

  db.leadsCrm[key] = {
    ...existing,
    ...patch,
    updatedAt: now(),
  };

  await writeDb(db);
  return db.leadsCrm[key];
}

export async function getCrmLead(id) {
  const db = await readDb();
  return db.leadsCrm?.[String(id)] ?? null;
}

export async function listCrmLeads() {
  const db = await readDb();
  return Object.values(db.leadsCrm || {}).sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  );
}

export async function clearCrmLeads() {
  const db = await readDb();
  db.leadsCrm = {};
  await writeDb(db);
  return true;
}

export async function removeCrmLead(id) {
  const db = await readDb();
  const key = String(id || "");
  if (!key) return false;
  if (!db.leadsCrm?.[key]) return false;

  delete db.leadsCrm[key];
  await writeDb(db);
  return true;
}

// ---------------- EXPORT CSV (NOVO) ----------------
// Requer permissão: "downloads" no manifest

export async function exportCrmLeadsCsv(opts = {}) {
  const { filename = "grabclientsnow_leads.csv", saveAs = true } = opts;

  const leads = await listCrmLeads();

  const rows = [
    ["Origem", "Nome", "Grupo", "Status", "Post", "Perfil", "Notas", "Data"],
    ...leads.map((l) => [
      l.origin || "",
      l.author || "",
      l.groupSlug || "",
      l.status || "",
      l.postUrl || "",
      l.profileName || "",
      (l.notes || "").replaceAll("\n", " "),
      new Date(l.createdAt || Date.now()).toLocaleString(),
    ]),
  ];

  const csv = rows.map((r) => r.map(safeCsv).join(";")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  try {
    await chrome.downloads.download({
      url,
      filename,
      saveAs,
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

// CSV helper (delimitador ;, aspas quando necessário)
function safeCsv(v) {
  const s = String(v ?? "");
  if (s.includes(";") || s.includes('"') || s.includes("\n")) {
    return `"${s.replaceAll('"', '""')}"`;
  }
  return s;
}
