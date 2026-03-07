export function classifyMonitorIssueKind(errorMessage) {
  const text = String(errorMessage || "").toLowerCase();

  if (
    text.includes("nenhuma aba do facebook aberta") ||
    text.includes("sem resposta da aba do facebook") ||
    text.includes("abra uma aba em facebook.com") ||
    text.includes("facebook tab was closed")
  ) {
    return "fb_tab_missing";
  }

  if (
    text.includes("não foi possível extrair os tokens") ||
    text.includes("not logged in") ||
    text.includes("session expired") ||
    text.includes("sessão expir") ||
    text.includes("please log in")
  ) {
    return "fb_login_required";
  }

  return "";
}

export function shouldNotifyMonitorIssue(previousIssue, issueKind, now = Date.now(), cooldownMs = 0) {
  if (!issueKind) return false;
  if (!previousIssue) return true;
  if (String(previousIssue.kind || "") !== String(issueKind)) return true;

  const lastNotifiedAt = Number(previousIssue.lastNotifiedAt || 0);
  if (!lastNotifiedAt) return true;
  return now - lastNotifiedAt >= cooldownMs;
}
