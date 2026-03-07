function buildLeadHaystack(lead) {
  return [
    lead?.group_name,
    lead?.poster_name,
    lead?.post_text,
    lead?.marketplace_text,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

export function filterLeads(
  leads,
  {
    profileFilter = "",
    textFilter = "",
    onlySelectedGroups = false,
    selectedGroupIds = new Set(),
  } = {},
) {
  let filtered = Array.isArray(leads) ? [...leads] : [];

  if (profileFilter) {
    filtered = filtered.filter(
      (lead) => String(lead?.profileName || "") === String(profileFilter),
    );
  }

  if (onlySelectedGroups) {
    filtered = filtered.filter((lead) =>
      selectedGroupIds.has(String(lead?.group_id || "")),
    );
  }

  const normalizedText = String(textFilter || "").trim().toLowerCase();
  if (normalizedText) {
    filtered = filtered.filter((lead) =>
      buildLeadHaystack(lead).includes(normalizedText),
    );
  }

  return filtered;
}
