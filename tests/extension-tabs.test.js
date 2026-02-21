import test from "node:test";
import assert from "node:assert/strict";
import {
  getTabIdsToClose,
  pickKeepTab,
} from "../src/background/extension-tabs.js";

test("pickKeepTab prioritizes preferred tab id when present", () => {
  const tabs = [
    { id: 1, active: false, lastAccessed: 100 },
    { id: 2, active: true, lastAccessed: 300 },
    { id: 3, active: false, lastAccessed: 500 },
  ];

  const keep = pickKeepTab(tabs, 1);
  assert.equal(keep?.id, 1);
});

test("pickKeepTab falls back to active tab, then most recently accessed", () => {
  const tabsWithActive = [
    { id: 1, active: false, lastAccessed: 100 },
    { id: 2, active: true, lastAccessed: 150 },
    { id: 3, active: false, lastAccessed: 999 },
  ];
  assert.equal(pickKeepTab(tabsWithActive)?.id, 2);

  const tabsWithoutActive = [
    { id: 1, active: false, lastAccessed: 100 },
    { id: 2, active: false, lastAccessed: 350 },
    { id: 3, active: false, lastAccessed: 200 },
  ];
  assert.equal(pickKeepTab(tabsWithoutActive)?.id, 2);
});

test("getTabIdsToClose returns all tab ids except the one to keep", () => {
  const tabs = [
    { id: 10, active: true },
    { id: 20, active: false },
    { id: 30, active: false },
  ];

  assert.deepEqual(getTabIdsToClose(tabs, 20), [10, 30]);
});

test("tab helper functions handle invalid inputs safely", () => {
  assert.equal(pickKeepTab([], 1), null);
  assert.equal(pickKeepTab(null, 1), null);
  assert.deepEqual(getTabIdsToClose([], 1), []);
  assert.deepEqual(getTabIdsToClose(null, 1), []);
  assert.deepEqual(getTabIdsToClose([{ id: 1 }], null), []);
});
