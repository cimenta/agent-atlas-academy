import { test } from "node:test";
import assert from "node:assert/strict";
import { keyState, overallKeyState } from "../public/js/key-state.js";

const vault = (stored, session) => ({ hasStoredKey: () => stored, getSessionKey: () => session });

test("a key in memory is loaded, a saved key without one is locked, otherwise there is none", () => {
  assert.equal(keyState(vault(false, "k")), "loaded");
  assert.equal(keyState(vault(true, "k")), "loaded");
  assert.equal(keyState(vault(true, null)), "locked");
  assert.equal(keyState(vault(false, null)), "none");
});

test("the overall state is locked when any key needs unlocking, else loaded when any is loaded", () => {
  assert.equal(overallKeyState(["none", "none"]), "none");
  assert.equal(overallKeyState(["loaded", "none"]), "loaded");
  assert.equal(overallKeyState(["loaded", "locked"]), "locked");
  assert.equal(overallKeyState([]), "none");
});
