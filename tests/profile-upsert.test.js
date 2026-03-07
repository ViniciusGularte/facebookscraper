import test from "node:test";
import assert from "node:assert/strict";
import { upsertProfile } from "../src/panel/profile-upsert.js";

test("upsertProfile creates a new profile when nothing is selected", () => {
  const result = upsertProfile({
    savedProfiles: [],
    draft: {
      name: "Roofing Leads",
      positiveKeywords: ["roofer"],
      negativeKeywords: ["job"],
      minMinutes: 3,
      maxMinutes: 8,
    },
    nowIso: "2026-03-07T10:00:00.000Z",
    createId: () => "p1",
  });

  assert.equal(result.selectedProfileId, "p1");
  assert.equal(result.created, true);
  assert.equal(result.savedProfiles.length, 1);
});

test("upsertProfile overwrites duplicate name when creating a new profile", () => {
  const result = upsertProfile({
    savedProfiles: [
      {
        id: "existing",
        name: "Roofing Leads",
        positiveKeywords: ["old"],
        negativeKeywords: [],
        minMinutes: 15,
        maxMinutes: 20,
        updatedAt: "old",
      },
    ],
    draft: {
      name: " roofing leads ",
      positiveKeywords: ["roofer"],
      negativeKeywords: ["job"],
      minMinutes: 3,
      maxMinutes: 8,
    },
    nowIso: "2026-03-07T10:00:00.000Z",
  });

  assert.equal(result.created, false);
  assert.equal(result.selectedProfileId, "existing");
  assert.equal(result.duplicateName, "Roofing Leads");
  assert.deepEqual(result.savedProfiles[0].positiveKeywords, ["roofer"]);
});

test("upsertProfile updates the selected profile in place", () => {
  const result = upsertProfile({
    savedProfiles: [
      {
        id: "p1",
        name: "Roofing Leads",
        positiveKeywords: ["roofer"],
        negativeKeywords: [],
        minMinutes: 3,
        maxMinutes: 8,
        updatedAt: "old",
      },
    ],
    selectedProfileId: "p1",
    draft: {
      name: "Roofing Leads Pro",
      positiveKeywords: ["roofer", "roof repair"],
      negativeKeywords: ["job"],
      minMinutes: 5,
      maxMinutes: 10,
    },
    nowIso: "2026-03-07T10:00:00.000Z",
  });

  assert.equal(result.created, false);
  assert.equal(result.savedProfiles[0].name, "Roofing Leads Pro");
  assert.equal(result.savedProfiles[0].updatedAt, "2026-03-07T10:00:00.000Z");
});
