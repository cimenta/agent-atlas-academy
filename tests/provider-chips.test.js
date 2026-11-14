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
