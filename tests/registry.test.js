import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_IDS, providerCatalog, MODELS } from "../public/js/engine/catalog.js";
import { SLOT_IDS, slotProvider, slotIsFree } from "../public/js/key-slots.js";
import { usageCostUsd } from "../public/js/engine/cost.js";
import { DEFAULT_PROVIDER_COLORS, providerChips } from "../public/js/provider-colors.js";
import { retryChoices } from "../public/js/replay/retry-choice.js";

// These tests pin the behaviour from before the registry: they pass on the old code and must pass on the new.
test("the providers and the key slots are the same as before the registry", () => {
  assert.deepEqual(PROVIDER_IDS, ["anthropic", "google", "groq"]);
  assert.deepEqual(SLOT_IDS, ["anthropic", "google-free", "google", "groq-free", "groq"]);
  assert.equal(slotProvider("anthropic"), "anthropic");
  assert.equal(slotProvider("google-free"), "google");
  assert.equal(slotProvider("google"), "google");
  assert.equal(slotProvider("nope"), "anthropic");
  assert.equal(slotIsFree("google-free"), true);
  assert.equal(slotIsFree("google"), false);
  assert.equal(slotIsFree("anthropic"), false);
  assert.equal(providerCatalog("anthropic").models, MODELS);
});

test("the cost of a call is the same as before the registry", () => {
  assert.ok(Math.abs(usageCostUsd({ input: 1000, output: 1000 }, { model: "fast" }, { provider: "anthropic" }) - 0.006) < 1e-9);
  assert.ok(Math.abs(usageCostUsd({ input: 1000, output: 1000, searches: 2 }, { slot: "google", model: "balanced" }) - (0.0045 + 2 * 0.014)) < 1e-9);
  assert.equal(usageCostUsd({ input: 1000, output: 1000, searches: 2 }, { slot: "google-free", model: "balanced" }), 0);
});

test("the colours and the chips are the same as before the registry", () => {
  assert.deepEqual(DEFAULT_PROVIDER_COLORS, { anthropic: "#d97757", google: "#4285f4", groq: "#f55036" });
  assert.deepEqual(providerChips("anthropic+google").map((c) => c.name), ["Anthropic", "Gemini"]);
  assert.equal(providerChips("gemini")[0].name, "Gemini");
});

test("the retry choices are the same as before the registry", () => {
  const design = { pattern: "sequential", nodes: [{ id: "a", agent: "writer", model: "fast", search: false }], edges: [] };
  const choices = retryChoices(design, "a");
  assert.equal(choices.length, 9);
  assert.equal(choices.filter((c) => c.current).length, 1);
  const strongGoogle = choices.find((c) => c.provider === "google" && c.tier === "strong");
  assert.equal(strongGoogle.value.slot, "google");
  assert.equal(strongGoogle.free, false);
  const fastGoogle = choices.find((c) => c.provider === "google" && c.tier === "fast");
  assert.equal(fastGoogle.value.slot, "google-free");
  assert.equal(fastGoogle.free, true);
  assert.equal(choices.find((c) => c.provider === "anthropic" && c.tier === "fast").value.slot, "anthropic");
});

import { PROVIDERS, freeSlotOf, keyShapeOk, slotsOf } from "../public/js/engine/providers.js";

test("the registry describes each provider", () => {
  assert.deepEqual(PROVIDERS.google.slots.map((s) => [s.id, s.free]), [["google-free", true], ["google", false]]);
  assert.deepEqual(PROVIDERS.anthropic.slots.map((s) => [s.id, s.free]), [["anthropic", false]]);
  assert.equal(freeSlotOf("google"), "google-free");
  assert.equal(freeSlotOf("anthropic"), null);
  assert.deepEqual(slotsOf("google"), ["google-free", "google"]);
  for (const p of Object.values(PROVIDERS)) assert.deepEqual(p.models.map((m) => m.key), ["fast", "balanced", "strong"]);
});

test("a key must have a plausible shape for its provider", () => {
  assert.equal(keyShapeOk("google", "sk-ant-" + "a".repeat(30)), false);
  assert.equal(keyShapeOk("anthropic", "x".repeat(19)), false);
  assert.equal(keyShapeOk("anthropic", "x".repeat(301)), false);
  assert.equal(keyShapeOk("anthropic", "x".repeat(40)), true);
  assert.equal(keyShapeOk("google", "x".repeat(40)), true);
  assert.equal(keyShapeOk("anthropic", 5), false);
});

import { createSettingsStore } from "../public/js/storage/settings.js";
import { createVault } from "../public/js/storage/key-vault.js";
import { backupVaultRecords } from "../public/js/storage/backup.js";

test("settings saved before the registry still read the same", () => {
  const mem = new Map([["aa.settings", JSON.stringify({ freeTier: { google: true }, providerColors: { google: "#112233" } })]]);
  const store = createSettingsStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) });
  assert.deepEqual(store.get().freeTier, { google: true, groq: false });
  assert.equal(store.get().providerColors.google, "#112233");
  assert.equal(store.get().providerColors.anthropic, "#d97757");
  store.setFreeTier("anthropic", true); // Anthropic has no free tier: ignored
  assert.deepEqual(store.get().freeTier, { google: true, groq: false });
});

test("the vault keeps the records where it kept them", () => {
  const mem = new Map();
  const vault = createVault({ storage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }, iterations: 1000 });
  assert.equal(vault.forProvider("anthropic"), vault);
  assert.notEqual(vault.forProvider("google"), vault.forProvider("google-free"));
  assert.deepEqual(Object.keys(backupVaultRecords((id) => vault.forProvider(id))).sort(), ["googleFreeRecord", "googleRecord", "slotRecords"]);
});
