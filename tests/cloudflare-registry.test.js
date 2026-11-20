import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROVIDERS, PROVIDER_IDS, SLOT_IDS, freeLimitsOf, freeSlotOf, slotsOf, modelIdOf, modelsOfSlot, keyShapeOk } from "../public/js/engine/providers.js";
import { nodeModel } from "../public/js/engine/catalog.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

const IDS = ["@cf/google/gemma-4-26b-a4b-it", "@cf/openai/gpt-oss-120b", "@cf/qwen/qwen3.8-27b"];
const ACCOUNT = "0123456789abcdef0123456789abcdef";
const TOKEN = "AbCdEf_0123456789-AbCdEf_0123456789-xyz";

test("Cloudflare is the fifth provider with a free and a paid slot, in that order", () => {
  assert.equal(PROVIDER_IDS.length, 5);
  const p = PROVIDERS.cloudflare;
  assert.equal(p.label, "Cloudflare");
  assert.equal(p.mark, "Cf");
  assert.equal(p.color, "#f6821f");
  assert.deepEqual(p.slots.map((s) => [s.id, s.free, s.labelKey]), [["cloudflare-free", true, "create.cloudflareFree"], ["cloudflare", false, "create.cloudflarePaid"]]);
  assert.deepEqual(slotsOf("cloudflare"), ["cloudflare-free", "cloudflare"]);
  assert.equal(freeSlotOf("cloudflare"), "cloudflare-free");
  assert.ok(SLOT_IDS.includes("cloudflare-free") && SLOT_IDS.includes("cloudflare"));
  assert.deepEqual(p.capabilities, { search: false });
});

test("the three models carry the ids and the neuron and dollar rates of the design, the same on both slots", () => {
  const models = PROVIDERS.cloudflare.models;
  assert.deepEqual(models.map((m) => m.key), ["fast", "balanced", "strong"]);
  assert.deepEqual(models.map((m) => m.id), IDS);
  assert.deepEqual(models.map((m) => [m.neuronsInPerM, m.neuronsOutPerM]), [[9091, 27273], [31818, 68182], [40909, 290909]]);
  assert.deepEqual(models.map((m) => [m.inputPerMTok, m.outputPerMTok]), [[0.1, 0.3], [0.35, 0.75], [0.45, 3.2]]);
  assert.ok(models.every((m) => m.freeTier === true && m.forcedFormat === true && m.freeId === undefined));
  for (const slot of ["cloudflare-free", "cloudflare"]) {
    assert.deepEqual(modelsOfSlot(slot).map((m) => m.id), IDS);
    assert.deepEqual(models.map((m) => modelIdOf(slot, m)), IDS);
    assert.equal(nodeModel({ slot, model: "strong" }).id, IDS[2]);
  }
});

test("the free limit is the daily pool of neurons and has no request or token numbers", () => {
  const l = freeLimitsOf("cloudflare-free");
  assert.equal(l.kind, "daily-pool");
  assert.equal(l.neuronsPerDay, 10000);
  assert.equal(l.perModel, false);
  assert.equal(l.resetsAtUtc, "00:00");
  assert.deepEqual([l.rpm, l.rpd, l.tpm, l.tpd], [null, null, null, null]);
  assert.equal(freeLimitsOf("cloudflare"), null);
});

test("keyShapeOk accepts ACCOUNT_ID:TOKEN and refuses the rest", () => {
  assert.equal(keyShapeOk("cloudflare", `${ACCOUNT}:${TOKEN}`), true);
  assert.equal(keyShapeOk("cloudflare", `${ACCOUNT.toUpperCase()}:${TOKEN}`), true);
  assert.equal(keyShapeOk("cloudflare", TOKEN), false);
  assert.equal(keyShapeOk("cloudflare", ACCOUNT), false);
  assert.equal(keyShapeOk("cloudflare", `${ACCOUNT}:`), false);
  assert.equal(keyShapeOk("cloudflare", `${ACCOUNT.slice(1)}:${TOKEN}`), false);
  assert.equal(keyShapeOk("cloudflare", `${ACCOUNT}:${TOKEN} x`), false);
  assert.equal(keyShapeOk("cloudflare", `${ACCOUNT}:${TOKEN}\n`), false);
  assert.equal(keyShapeOk("cloudflare", `${ACCOUNT}:${"a".repeat(400)}`), false);
  assert.equal(keyShapeOk("cloudflare", `sk-ant-${"a".repeat(40)}`), false);
  // the other providers keep the old rule
  assert.equal(keyShapeOk("groq", `gsk_${"a".repeat(30)}`), true);
});

test("every text key of the entry exists in en and cs, Czech differs, parameters match", () => {
  const p = PROVIDERS.cloudflare;
  const keys = [...Object.values(p.text), p.slots[0].labelKey, p.slots[1].labelKey];
  const names = (s) => (String(s).match(/\{(\w+)\}/g) ?? []).sort().join();
  for (const k of keys) {
    assert.equal(typeof en[k], "string", `en ${k}`);
    assert.equal(typeof cs[k], "string", `cs ${k}`);
    if (!/^create\.cloudflare(Free|Paid)$/.test(k)) assert.notEqual(en[k], cs[k], `cs differs ${k}`);
    assert.equal(names(en[k]), names(cs[k]), `params ${k}`);
  }
});
