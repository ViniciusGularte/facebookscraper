import test from "node:test";
import assert from "node:assert/strict";
import {
  consumeNotificationClickTarget,
  pruneNotificationClickMap,
  upsertNotificationClickTarget,
} from "../src/background/notification-click-map.js";

test("pruneNotificationClickMap removes expired and malformed entries", () => {
  const map = pruneNotificationClickMap(
    {
      keep: { url: "https://a", createdAt: 900 },
      old: { url: "https://b", createdAt: 100 },
      bad: { url: "https://c" },
    },
    { now: 1000, ttlMs: 200, maxItems: 10 },
  );

  assert.deepEqual(Object.keys(map), ["keep"]);
});

test("upsertNotificationClickTarget caps to newest entries", () => {
  let map = {};
  map = upsertNotificationClickTarget(map, "a", "https://a", { now: 100, ttlMs: 1000, maxItems: 2 });
  map = upsertNotificationClickTarget(map, "b", "https://b", { now: 200, ttlMs: 1000, maxItems: 2 });
  map = upsertNotificationClickTarget(map, "c", "https://c", { now: 300, ttlMs: 1000, maxItems: 2 });

  assert.deepEqual(Object.keys(map).sort(), ["b", "c"]);
});

test("consumeNotificationClickTarget returns url and removes consumed entry", () => {
  const { url, map } = consumeNotificationClickTarget(
    {
      a: { url: "https://a", createdAt: 100 },
      b: { url: "https://b", createdAt: 200 },
    },
    "a",
    { now: 250, ttlMs: 1000, maxItems: 10 },
  );

  assert.equal(url, "https://a");
  assert.deepEqual(Object.keys(map), ["b"]);
});
