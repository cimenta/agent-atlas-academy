import { test } from "node:test";
import assert from "node:assert/strict";
import { providerChips } from "../public/js/provider-colors.js";

test("a mixed run gets one chip per provider in its color", () => {
  const chips = providerChips("anthropic+google", { google: "#2e9e6b" });
  assert.deepEqual(chips.map((c) => c.name), ["Anthropic", "Gemini"]);
  assert.equal(chips[0].background, "#d97757");
  assert.equal(chips[1].background, "#2e9e6b");
});

test("no provider gives no chips and an unknown provider a grey one", () => {
  assert.deepEqual(providerChips(undefined), []);
  assert.equal(providerChips("acme")[0].name, "Acme");
});

import { deriveInspector } from "../public/js/replay/inspect-model.js";

test("a warning keeps the clock time it happened at", () => {
  const events = [
    { type: "run_start", t: 0, agents: [] },
    { type: "warning", t: 10, message: "busy", at: 1700000000000 },
    { type: "warning", t: 20, message: "older run" },
  ];
  const state = deriveInspector(events);
  assert.deepEqual(state.warnings, ["busy", "older run"]);
  assert.deepEqual(state.warningTimes, [1700000000000, null]);
});
