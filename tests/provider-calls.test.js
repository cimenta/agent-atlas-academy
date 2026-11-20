import { test } from "node:test";
import assert from "node:assert/strict";
import { providerCalls } from "../lib/provider-calls.js";
import { PROVIDER_IDS } from "../public/js/engine/providers.js";
import { callAnthropic } from "../public/js/engine/anthropic.js";
import { callGemini } from "../public/js/engine/gemini.js";

test("there is a call for every provider of the registry", () => {
  const calls = providerCalls({});
  assert.deepEqual(Object.keys(calls), PROVIDER_IDS);
  for (const id of PROVIDER_IDS) assert.equal(typeof calls[id], "function");
  assert.equal(calls.anthropic, callAnthropic);
  assert.equal(calls.google, callGemini);
});

test("injected calls replace the real ones", () => {
  const a = async () => {};
  const g = async () => {};
  const calls = providerCalls({ call: a, callGoogle: g });
  assert.equal(calls.anthropic, a);
  assert.equal(calls.google, g);
});
