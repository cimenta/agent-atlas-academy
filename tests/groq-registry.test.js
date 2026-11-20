import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROVIDERS, PROVIDER_IDS, keyShapeOk, freeLimitsOf, SLOT_IDS } from "../public/js/engine/providers.js";
import { providerCatalog } from "../public/js/engine/catalog.js";
import { slotFreeLimits } from "../public/js/key-slots.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

test("Groq has the fixed triple of models, all on the free tier, with prices", () => {
  const models = PROVIDERS.groq.models;
  assert.deepEqual(models.map((m) => m.key), ["fast", "balanced", "strong"]);
  assert.deepEqual(models.map((m) => m.id), ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "openai/gpt-oss-120b"]);
  assert.ok(models.every((m) => m.freeTier === true && m.inputPerMTok > 0 && m.outputPerMTok > 0));
  assert.equal(providerCatalog("groq").models.length, 3);
  assert.ok(PROVIDER_IDS.includes("groq"));
});

test("Groq has a free and a paid key slot, in that order", () => {
  assert.deepEqual(PROVIDERS.groq.slots.map((s) => [s.id, s.free]), [["groq-free", true], ["groq", false]]);
  assert.ok(SLOT_IDS.includes("groq-free") && SLOT_IDS.includes("groq"));
});

test("free limits belong to the free slot of Groq only", () => {
  const limits = { kind: "account-plan", scope: "account", perModel: true, rpm: 30, tpm: 8000, rpd: 1000, tpd: 200000, verifiedOn: "2026-11-20" };
  assert.deepEqual(freeLimitsOf("groq-free"), limits);
  assert.deepEqual(slotFreeLimits("groq-free"), limits);
  for (const slot of ["groq", "anthropic", "google-free", "google", "nope"]) assert.equal(freeLimitsOf(slot), null, slot);
});

test("capabilities: only Groq has no web search", () => {
  assert.equal(PROVIDERS.groq.capabilities.search, false);
  assert.equal(PROVIDERS.anthropic.capabilities.search, true);
  assert.equal(PROVIDERS.google.capabilities.search, true);
});

test("the shape check refuses an Anthropic key for Groq and accepts a Groq key", () => {
  assert.equal(keyShapeOk("groq", `sk-ant-${"x".repeat(30)}`), false);
  assert.equal(keyShapeOk("groq", `gsk_${"x".repeat(40)}`), true);
});

test("the texts of Groq exist in both languages and Czech differs", () => {
  const keys = [...Object.values(PROVIDERS.groq.text).filter(Boolean), "create.groqFree", "create.groqPaid"];
  for (const k of keys) {
    assert.equal(typeof en[k], "string", `en ${k}`);
    assert.equal(typeof cs[k], "string", `cs ${k}`);
    assert.notEqual(en[k], cs[k], `${k} same`);
  }
  assert.match(en["create.dataNoticeGroq"], /United States/);
});

test("a provider with a free plan says in its own words what free means", () => {
  for (const id of ["google", "groq"]) {
    for (const k of ["estimateFree", "freeWarning"]) {
      const key = PROVIDERS[id].text[k];
      assert.equal(typeof en[key], "string", `${id}.${k}`);
      assert.equal(typeof cs[key], "string", `${id}.${k} cs`);
    }
  }
  assert.notEqual(PROVIDERS.groq.text.estimateFree, PROVIDERS.google.text.estimateFree);
  assert.doesNotMatch(en[PROVIDERS.groq.text.estimateFree] + en[PROVIDERS.groq.text.freeWarning], /Google/);
});
