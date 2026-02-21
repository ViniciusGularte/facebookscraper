import test from "node:test";
import assert from "node:assert/strict";
import { repairJson } from "../src/background/json-repair.js";

test("repairJson repairs single quotes and trailing comma", () => {
  const input = "{'name':'Ana','age':30,}";
  const out = repairJson(input);
  const parsed = JSON.parse(out);

  assert.deepEqual(parsed, { name: "Ana", age: 30 });
});

test("repairJson repairs JS literals and undefined", () => {
  const input = "{active: True, blocked: False, notes: undefined}";
  const out = repairJson(input);
  const parsed = JSON.parse(out);

  assert.deepEqual(parsed, {
    active: true,
    blocked: false,
    notes: null,
  });
});

test("repairJson keeps valid JSON parseable", () => {
  const input = '{"ok":true,"items":[1,2,3]}';
  const out = repairJson(input);

  assert.doesNotThrow(() => JSON.parse(out));
  assert.deepEqual(JSON.parse(out), { ok: true, items: [1, 2, 3] });
});

test("repairJson handles fenced code blocks", () => {
  const input = "```json\n{'name':'Ana','age':30,}\n```";
  const out = repairJson(input);
  const parsed = JSON.parse(out);

  assert.deepEqual(parsed, { name: "Ana", age: 30 });
});

test("repairJson removes comments and trailing commas in nested structures", () => {
  const input = "{\n // comment\n a: 1,\n b: [1,2,],\n}";
  const out = repairJson(input);
  const parsed = JSON.parse(out);

  assert.deepEqual(parsed, { a: 1, b: [1, 2] });
});

test("repairJson converts unquoted URL values to strings", () => {
  const input = "{url: https://example.com/path?q=1, ok: true}";
  const out = repairJson(input);
  const parsed = JSON.parse(out);

  assert.deepEqual(parsed, { url: "https://example.com/path?q=1", ok: true });
});

test("repairJson skips ellipsis placeholders in arrays", () => {
  const input = "[1,2,...,3]";
  const out = repairJson(input);
  const parsed = JSON.parse(out);

  assert.deepEqual(parsed, [1, 2, 3]);
});

test("repairJson throws for empty input", () => {
  assert.throws(
    () => repairJson(""),
    /Unexpected end of json string/,
  );
});
