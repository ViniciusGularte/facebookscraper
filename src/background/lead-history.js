export function pruneLeadsHistory(leads, { now = Date.now(), ttlMs } = {}) {
  return (Array.isArray(leads) ? leads : []).filter((lead) => {
    const ts = Number(lead?.detectedAt) || 0;
    return ts > 0 && (typeof ttlMs !== "number" || now - ts <= ttlMs);
  });
}

export function buildLeadHistoryId(post, profileName) {
  const postId = String(post?.post_id || "unknown");
  const groupId = String(post?.group_id || "unknown");
  const profile = String(profileName || "default");
  return `${profile}::${groupId}::${postId}`;
}

export function mergeLeadHistory(currentLeads, matches, profileName, { now = Date.now(), ttlMs } = {}) {
  const current = pruneLeadsHistory(currentLeads, { now, ttlMs });
  const byId = new Map(current.map((lead) => [String(lead.id), lead]));

  for (const post of Array.isArray(matches) ? matches : []) {
    const id = buildLeadHistoryId(post, profileName);
    byId.set(id, {
      id,
      detectedAt: now,
      profileName: profileName || "",
      group_id: post?.group_id || "",
      group_name: post?.group_name || "",
      group_url: post?.group_url || "",
      poster_name: post?.poster_name || "",
      user_profile_url: post?.user_profile_url || "",
      post_id: post?.post_id || "",
      post_type: post?.post_type || "",
      post_text: post?.post_text || "",
      marketplace_text: post?.marketplace_text || "",
      post_url: post?.post_url || post?.marketplace_listing_url || "",
    });
  }

  return pruneLeadsHistory(
    Array.from(byId.values()).sort((a, b) => Number(b.detectedAt) - Number(a.detectedAt)),
    { now, ttlMs },
  );
}
