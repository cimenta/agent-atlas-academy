import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSeconds } from "../lib/stream-check.js";

test("parseSeconds reads a whole number of seconds", () => {
  assert.equal(parseSeconds("12"), 12);
});

test("parseSeconds falls back to 5 for missing or invalid values", () => {
  for (const value of [undefined, "0", "-3", "abc", "", "1.5", null]) {
    assert.equal(parseSeconds(value), 5, String(value));
  }
});

test("parseSeconds caps at 295", () => {
  assert.equal(parseSeconds("9999"), 295);
});
