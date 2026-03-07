import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLeadHistoryId,
  mergeLeadHistory,
  pruneLeadsHistory,
} from "../src/background/lead-history.js";

test("buildLeadHistoryId scopes duplicate posts by profile and group", () => {
  const post = { post_id: "p1", group_id: "g1" };
  assert.equal(buildLeadHistoryId(post, "A"), "A::g1::p1");
  assert.equal(buildLeadHistoryId(post, "B"), "B::g1::p1");
});

test("mergeLeadHistory deduplicates the same lead id and updates timestamp", () => {
  const current = [
    {
      id: "Roofing::g1::p1",
      detectedAt: 1000,
      profileName: "Roofing",
      post_id: "p1",
      group_id: "g1",
    },
  ];

  const merged = mergeLeadHistory(
    current,
    [{ post_id: "p1", group_id: "g1", group_name: "G", poster_name: "Ana" }],
    "Roofing",
    { now: 5000, ttlMs: 10000 },
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].detectedAt, 5000);
  assert.equal(merged[0].poster_name, "Ana");
});

test("mergeLeadHistory keeps same post in different profiles as separate items", () => {
  const merged = mergeLeadHistory(
    [],
    [{ post_id: "p1", group_id: "g1" }],
    "Roofing",
    { now: 1000, ttlMs: 10000 },
  );
  const mergedAgain = mergeLeadHistory(
    merged,
    [{ post_id: "p1", group_id: "g1" }],
    "Photography",
    { now: 2000, ttlMs: 10000 },
  );

  assert.equal(mergedAgain.length, 2);
});

test("pruneLeadsHistory removes expired entries", () => {
  const pruned = pruneLeadsHistory(
    [
      { id: "old", detectedAt: 1000 },
      { id: "new", detectedAt: 9000 },
    ],
    { now: 10000, ttlMs: 2000 },
  );

  assert.deepEqual(pruned.map((item) => item.id), ["new"]);
});
