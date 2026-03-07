import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyMonitorIssueKind,
  shouldNotifyMonitorIssue,
} from "../src/background/monitor-issues.js";

test("classifyMonitorIssueKind detects facebook-tab missing errors", () => {
  assert.equal(
    classifyMonitorIssueKind("Nenhuma aba do Facebook aberta. Abra facebook.com e tente novamente."),
    "fb_tab_missing",
  );
  assert.equal(
    classifyMonitorIssueKind("facebook tab was closed"),
    "fb_tab_missing",
  );
});

test("classifyMonitorIssueKind detects login/session errors", () => {
  assert.equal(classifyMonitorIssueKind("Not logged in. Please log in."), "fb_login_required");
  assert.equal(classifyMonitorIssueKind("session expired"), "fb_login_required");
});

test("shouldNotifyMonitorIssue applies cooldown only for same issue kind", () => {
  assert.equal(shouldNotifyMonitorIssue(null, "fb_tab_missing", 1000, 500), true);
  assert.equal(
    shouldNotifyMonitorIssue({ kind: "fb_tab_missing", lastNotifiedAt: 800 }, "fb_tab_missing", 1000, 500),
    false,
  );
  assert.equal(
    shouldNotifyMonitorIssue({ kind: "fb_tab_missing", lastNotifiedAt: 100 }, "fb_tab_missing", 1000, 500),
    true,
  );
  assert.equal(
    shouldNotifyMonitorIssue({ kind: "fb_tab_missing", lastNotifiedAt: 900 }, "fb_login_required", 1000, 500),
    true,
  );
});
