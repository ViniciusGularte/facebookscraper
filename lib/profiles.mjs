const PROFILES_KEY = "profiles_v1";

function defaultProfiles() {
  return {
    default: {
      id: "default",
      name: "Padrão",
      include: [
        "vaga",
        "freelancer",
        "orçamento",
        "indicação",
        "procuro",
        "preciso",
      ],
      exclude: ["curso", "mentoria"],
    },
    psicologo: {
      id: "psicologo",
      name: "Psicólogo",
      include: [
        "terapia",
        "psicólogo",
        "psicologa",
        "consulta",
        "atendimento",
        "online",
      ],
      exclude: ["curso", "formação", "treinamento"],
    },
    designer: {
      id: "designer",
      name: "Designer",
      include: [
        "logo",
        "identidade visual",
        "branding",
        "social media",
        "layout",
        "designer",
      ],
      exclude: ["tutorial", "curso"],
    },
  };
}

async function readProfiles() {
  const { [PROFILES_KEY]: profiles } =
    await chrome.storage.local.get(PROFILES_KEY);

  // se não existe -> defaults
  if (!profiles) return defaultProfiles();

  // se existe mas veio vazio -> defaults (corrige storage “zumbificado”)
  if (typeof profiles === "object" && Object.keys(profiles).length === 0) {
    const d = defaultProfiles();
    await chrome.storage.local.set({ [PROFILES_KEY]: d });
    return d;
  }

  return profiles;
}

async function writeProfiles(profiles) {
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
}

export async function listProfiles() {
  const profiles = await readProfiles();
  return Object.values(profiles).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getProfile(id) {
  const profiles = await readProfiles();
  return profiles[id] ?? null;
}

export async function upsertProfile(profile) {
  const profiles = await readProfiles();
  profiles[profile.id] = profile;
  await writeProfiles(profiles);
  return profile;
}

export async function removeProfile(id) {
  if (id === "default") return false;
  const profiles = await readProfiles();
  if (!profiles[id]) return false;
  delete profiles[id];
  await writeProfiles(profiles);
  return true;
}

export function normalizeKeywords(text) {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);
}

export function matchText(text, profile) {
  const t = (text ?? "").toLowerCase();
  const hasInclude = (profile.include ?? []).some((k) =>
    t.includes(k.toLowerCase()),
  );
  const hasExclude = (profile.exclude ?? []).some((k) =>
    t.includes(k.toLowerCase()),
  );
  return hasInclude && !hasExclude;
}
export async function ensureDefaultProfilesPersisted() {
  const { [PROFILES_KEY]: profiles } =
    await chrome.storage.local.get(PROFILES_KEY);
  if (profiles && Object.keys(profiles).length) return profiles;

  const defaults = defaultProfiles();
  await chrome.storage.local.set({ [PROFILES_KEY]: defaults });
  return defaults;
}
