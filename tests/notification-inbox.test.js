import test from "node:test";
import assert from "node:assert/strict";
import {
  appendNotificationInboxItem,
  buildNotificationCounters,
  pruneNotificationInbox,
} from "../src/background/notification-inbox.js";

test("pruneNotificationInbox removes expired items, sorts newest first and caps list", () => {
  const now = 1_000_000;
  const inbox = pruneNotificationInbox(
    [
      { id: "old", createdAt: now - 10_000 },
      { id: "b", createdAt: now - 100 },
      { id: "a", createdAt: now - 50 },
      { id: "bad" },
    ],
    { now, ttlMs: 5_000, maxItems: 2 },
  );

  assert.deepEqual(inbox.map((item) => item.id), ["a", "b"]);
});

test("buildNotificationCounters counts unread items correctly", () => {
  const counters = buildNotificationCounters([
    { id: "1", seenAt: 0 },
    { id: "2", seenAt: 123 },
    { id: "3", seenAt: null },
  ]);

  assert.deepEqual(counters, { total: 3, unread: 2 });
});

test("appendNotificationInboxItem prepends new item and returns synced counters", () => {
  const now = 5_000;
  const result = appendNotificationInboxItem(
    [{ id: "older", createdAt: now - 100, seenAt: 0 }],
    { id: "new", createdAt: now, seenAt: 0 },
    { now, ttlMs: 10_000, maxItems: 10 },
  );

  assert.deepEqual(result.inbox.map((item) => item.id), ["new", "older"]);
  assert.deepEqual(result.counters, { total: 2, unread: 2 });
});
