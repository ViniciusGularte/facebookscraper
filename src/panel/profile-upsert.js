export function upsertProfile({
  savedProfiles,
  selectedProfileId = "",
  draft,
  nowIso = new Date().toISOString(),
  createId = () => `${Date.now()}`,
}) {
  const profiles = Array.isArray(savedProfiles) ? [...savedProfiles] : [];
  const nextDraft = {
    name: String(draft?.name || "").trim(),
    positiveKeywords: Array.isArray(draft?.positiveKeywords) ? draft.positiveKeywords : [],
    negativeKeywords: Array.isArray(draft?.negativeKeywords) ? draft.negativeKeywords : [],
    minMinutes: Number(draft?.minMinutes) || 5,
    maxMinutes: Number(draft?.maxMinutes) || 10,
  };

  let nextSelectedProfileId = String(selectedProfileId || "").trim();
  let duplicateName = "";

  if (!nextSelectedProfileId) {
    const duplicate = profiles.find(
      (profile) =>
        String(profile?.name || "").trim().toLowerCase() === nextDraft.name.toLowerCase(),
    );
    if (duplicate) {
      nextSelectedProfileId = String(duplicate.id || "");
      duplicateName = String(duplicate.name || "");
    }
  }

  if (nextSelectedProfileId) {
    const index = profiles.findIndex(
      (profile) => String(profile?.id || "") === nextSelectedProfileId,
    );
    if (index >= 0) {
      profiles[index] = {
        ...profiles[index],
        ...nextDraft,
        updatedAt: nowIso,
      };
      return {
        savedProfiles: profiles,
        selectedProfileId: nextSelectedProfileId,
        duplicateName,
        created: false,
      };
    }
  }

  nextSelectedProfileId = nextSelectedProfileId || String(createId());
  profiles.push({
    id: nextSelectedProfileId,
    ...nextDraft,
    updatedAt: nowIso,
  });
  return {
    savedProfiles: profiles,
    selectedProfileId: nextSelectedProfileId,
    duplicateName,
    created: true,
  };
}
