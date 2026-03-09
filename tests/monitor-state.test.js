import test from "node:test";
import assert from "node:assert/strict";
import {
  buildMonitorStateResponse,
  normalizeMonitorConfig,
} from "../src/background/monitor-state.js";

test("normalizeMonitorConfig normalizes ids, trims profile and lowercases keywords", () => {
  const config = normalizeMonitorConfig({
    selectedGroupIds: [10, "20"],
    positiveKeywords: [" Need Help ", "", null, "Plumber"],
    negativeKeywords: ["Selling", " JOB "],
    profileName: "  Local Leads  ",
    minMinutes: "5",
    maxMinutes: "",
  });

  assert.deepEqual(config.selectedGroupIds, ["10", "20"]);
  assert.deepEqual(config.positiveKeywords, ["need help", "plumber"]);
  assert.deepEqual(config.negativeKeywords, ["selling", "job"]);
  assert.equal(config.profileName, "Local Leads");
  assert.equal(config.minMinutes, 5);
  assert.equal(config.maxMinutes, 8);
});

test("buildMonitorStateResponse prefers persisted runtime and falls back to live state", () => {
  const response = buildMonitorStateResponse(
    {
      running: false,
      sleepModeActive: true,
      config: { profileName: "Saved" },
      connectionIssue: { kind: "fb_tab_missing" },
    },
    {
      isMonitorRunning: true,
      isSleepModeActive: false,
      monitorConfig: { profileName: "Live" },
      monitorConnectionIssue: { kind: "other" },
    },
  );

  assert.deepEqual(response, {
    success: true,
    running: true,
    sleepModeActive: true,
    config: { profileName: "Saved" },
    connectionIssue: { kind: "fb_tab_missing" },
  });
});
