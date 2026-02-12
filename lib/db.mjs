import { CONFIG } from "./config.mjs";

const DB_KEY = "db_v1";

function now() {
  return Date.now();
}

function defaultDb() {
  return {
    groups: {},
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
