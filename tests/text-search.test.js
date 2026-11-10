import { test } from "node:test";
import assert from "node:assert/strict";
import { findMatches } from "../public/js/text-search.js";

test("findMatches finds every occurrence, ignoring case", () => {
  assert.deepEqual(findMatches("Chess and chess and CHESS", "chess"), [
    { start: 0, end: 5 },
    { start: 10, end: 15 },
    { start: 20, end: 25 },
  ]);
});

test("findMatches returns nothing for an empty query or no hit", () => {
  assert.deepEqual(findMatches("abc", ""), []);
  assert.deepEqual(findMatches("abc", "z"), []);
});

test("findMatches treats the query as plain text, not a pattern", () => {
  assert.deepEqual(findMatches("a.b a*b", "a.b"), [{ start: 0, end: 3 }]);
  assert.deepEqual(findMatches("(x) [y]", "(x)"), [{ start: 0, end: 3 }]);
});
