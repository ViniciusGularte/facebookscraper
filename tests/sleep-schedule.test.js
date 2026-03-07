import test from "node:test";
import assert from "node:assert/strict";
import {
  getDefaultSleepSchedule,
  getSleepModeTransition,
  isSleepWindowNow,
  normalizeSleepSchedule,
} from "../src/background/sleep-schedule.js";

test("normalizeSleepSchedule clamps invalid values and preserves valid days", () => {
  const schedule = normalizeSleepSchedule({
    enabled: "yes",
    startHour: 99,
    startMinute: -4,
    endHour: "6",
    endMinute: "61",
    days: [1, 1, 8, "2", -1],
    timezone: "Invalid/Timezone",
  }, getDefaultSleepSchedule("UTC"));

  assert.equal(schedule.enabled, true);
  assert.equal(schedule.startHour, 23);
  assert.equal(schedule.startMinute, 0);
  assert.equal(schedule.endHour, 6);
  assert.equal(schedule.endMinute, 59);
  assert.deepEqual(schedule.days, [1, 2]);
  assert.equal(schedule.timezone, "UTC");
});

test("isSleepWindowNow honors same-day windows in the configured timezone", () => {
  const schedule = normalizeSleepSchedule({
    enabled: true,
    startHour: 9,
    startMinute: 0,
    endHour: 17,
    endMinute: 0,
    days: [1],
    timezone: "UTC",
  });

  assert.equal(isSleepWindowNow(schedule, new Date("2026-03-02T10:30:00Z")), true);
  assert.equal(isSleepWindowNow(schedule, new Date("2026-03-02T08:59:00Z")), false);
  assert.equal(isSleepWindowNow(schedule, new Date("2026-03-03T10:30:00Z")), false);
});

test("isSleepWindowNow keeps overnight sleep active after midnight using the previous selected day", () => {
  const schedule = normalizeSleepSchedule({
    enabled: true,
    startHour: 22,
    startMinute: 0,
    endHour: 7,
    endMinute: 0,
    days: [1],
    timezone: "UTC",
  });

  assert.equal(isSleepWindowNow(schedule, new Date("2026-03-02T23:30:00Z")), true);
  assert.equal(isSleepWindowNow(schedule, new Date("2026-03-03T02:15:00Z")), true);
  assert.equal(isSleepWindowNow(schedule, new Date("2026-03-03T08:00:00Z")), false);
});

test("isSleepWindowNow respects the stored timezone instead of local runtime timezone", () => {
  const schedule = normalizeSleepSchedule({
    enabled: true,
    startHour: 22,
    startMinute: 0,
    endHour: 7,
    endMinute: 0,
    days: [0],
    timezone: "America/Sao_Paulo",
  });

  assert.equal(isSleepWindowNow(schedule, new Date("2026-03-09T05:30:00Z")), true);
  assert.equal(isSleepWindowNow(schedule, new Date("2026-03-09T10:30:00Z")), false);
});

test("getSleepModeTransition resumes monitoring when sleep is cancelled after a pause", () => {
  const transition = getSleepModeTransition({
    schedule: {
      enabled: false,
      startHour: 22,
      startMinute: 0,
      endHour: 7,
      endMinute: 0,
      days: [1, 2, 3, 4, 5, 6, 0],
      timezone: "UTC",
    },
    isSleepModeActive: true,
    isMonitorRunning: false,
    wasRunningBeforeSleep: true,
  }, new Date("2026-03-02T23:00:00Z"));

  assert.equal(transition.exitedSleep, true);
  assert.equal(transition.resumeMonitor, true);
  assert.equal(transition.nextSleepModeActive, false);
  assert.equal(transition.nextMonitorRunning, true);
  assert.equal(transition.nextWasRunningBeforeSleep, false);
});

test("getSleepModeTransition does not restart monitoring if it was manually stopped during sleep", () => {
  const transition = getSleepModeTransition({
    schedule: {
      enabled: false,
      startHour: 22,
      startMinute: 0,
      endHour: 7,
      endMinute: 0,
      days: [1, 2, 3, 4, 5, 6, 0],
      timezone: "UTC",
    },
    isSleepModeActive: true,
    isMonitorRunning: false,
    wasRunningBeforeSleep: false,
  }, new Date("2026-03-02T23:00:00Z"));

  assert.equal(transition.exitedSleep, true);
  assert.equal(transition.resumeMonitor, false);
  assert.equal(transition.nextMonitorRunning, false);
});
