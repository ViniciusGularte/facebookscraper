import test from "node:test";
import assert from "node:assert/strict";
import { filterLeads } from "../src/panel/leads-filter.js";

const baseLeads = [
  {
    profileName: "Roofing",
    group_id: "1",
    group_name: "Local Services",
    poster_name: "Ana",
    post_text: "Need a roofer urgently",
    marketplace_text: "",
  },
  {
    profileName: "Photography",
    group_id: "2",
    group_name: "Weddings",
    poster_name: "Bruno",
    post_text: "",
    marketplace_text: "Photographer for Saturday",
  },
];

test("filterLeads filters by profile and selected groups together", () => {
  const result = filterLeads(baseLeads, {
    profileFilter: "Roofing",
    onlySelectedGroups: true,
    selectedGroupIds: new Set(["1"]),
  });

  assert.equal(result.length, 1);
  assert.equal(result[0].poster_name, "Ana");
});

test("filterLeads matches text across group, author, post and marketplace text", () => {
  assert.equal(
    filterLeads(baseLeads, { textFilter: "weddings" }).length,
    1,
  );
  assert.equal(
    filterLeads(baseLeads, { textFilter: "bruno" }).length,
    1,
  );
  assert.equal(
    filterLeads(baseLeads, { textFilter: "photographer" }).length,
    1,
  );
});
