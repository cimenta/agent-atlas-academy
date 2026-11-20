import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { PROVIDERS, PROVIDER_IDS, SLOT_IDS, freeLimitsOf, modelIdOf, modelsOfSlot, overrideIdOk, keyShapeOk } from "../public/js/engine/providers.js";
import { nodeModel, fallbackModelFor } from "../public/js/engine/catalog.js";
import { usageCostUsd } from "../public/js/engine/cost.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

const FREE = ["google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free"];
const PAID = ["deepseek/deepseek-v4-flash", "anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5"];

test("OpenRouter is the fourth provider with a free and a paid slot, in that order", () => {
  assert.ok(PROVIDER_IDS.includes("openrouter"));
  const p = PROVIDERS.openrouter;
  assert.equal(p.label, "OpenRouter");
  assert.equal(p.chipName, "OpenRouter");
  assert.equal(p.mark, "Or");
  assert.equal(p.color, "#6467f2");
  assert.deepEqual(p.slots.map((s) => [s.id, s.free, s.labelKey]), [["openrouter-free", true, "create.openrouterFree"], ["openrouter", false, "create.openrouterPaid"]]);
  assert.ok(SLOT_IDS.includes("openrouter-free") && SLOT_IDS.includes("openrouter"));
  assert.deepEqual(p.capabilities, { search: false });
});

test("the model ids follow the slot: free ids on the free slot, paid ids on the paid slot", () => {
  const models = PROVIDERS.openrouter.models;
  assert.deepEqual(models.map((m) => m.key), ["fast", "balanced", "strong"]);
  assert.deepEqual(models.map((m) => modelIdOf("openrouter-free", m)), FREE);
  assert.deepEqual(models.map((m) => modelIdOf("openrouter", m)), PAID);
  assert.deepEqual(modelsOfSlot("openrouter-free").map((m) => m.id), FREE);
  assert.deepEqual(modelsOfSlot("openrouter").map((m) => m.id), PAID);
  assert.deepEqual(modelsOfSlot("openrouter").map((m) => [m.inputPerMTok, m.outputPerMTok]), [[0.09, 0.18], [0.1, 0.5], [2, 10]]);
  assert.ok(modelsOfSlot("openrouter-free").every((m) => m.inputPerMTok === 0 && m.outputPerMTok === 0));
  // the other providers read the same through the helpers
  assert.deepEqual(modelsOfSlot("groq-free").map((m) => m.id), PROVIDERS.groq.models.map((m) => m.id));
  assert.deepEqual(modelsOfSlot("anthropic").map((m) => m.id), PROVIDERS.anthropic.models.map((m) => m.id));
});

test("only the free Strong model cannot force a reply format", () => {
  assert.deepEqual(modelsOfSlot("openrouter-free").map((m) => m.forcedFormat), [true, true, false]);
  assert.deepEqual(modelsOfSlot("openrouter").map((m) => m.forcedFormat), [true, true, true]);
});

test("free limits: requests only, one account bucket, and only on the free slot", () => {
  const l = freeLimitsOf("openrouter-free");
  assert.equal(l.rpm, 20);
  assert.equal(l.rpd, 50);
  assert.equal(l.tpm, null);
  assert.equal(l.tpd, null);
  assert.equal(l.perModel, false);
  assert.equal(l.verifiedOn, "2026-11-20");
  assert.equal(freeLimitsOf("openrouter"), null);
});

test("nodeModel gives the id of the node's slot", () => {
  assert.equal(nodeModel({ slot: "openrouter-free", model: "fast" }).id, FREE[0]);
  assert.equal(nodeModel({ slot: "openrouter", model: "strong" }).id, PAID[2]);
  assert.equal(nodeModel({ slot: "openrouter-free", model: "strong" }).forcedFormat, false);
  assert.equal(nodeModel({ slot: "groq-free", model: "balanced" }).id, "openai/gpt-oss-120b");
});

test("a free OpenRouter agent costs nothing and a paid one costs by the paid prices", () => {
  const usage = { input: 1_000_000, output: 1_000_000 };
  assert.equal(usageCostUsd(usage, { slot: "openrouter-free", model: "balanced" }), 0);
  assert.equal(usageCostUsd(usage, { slot: "openrouter", model: "balanced" }), 0.6);
});

test("an override id replaces the model of a free agent only when it has a good shape", () => {
  const ok = "meta-llama/llama-4-scout:free";
  assert.equal(nodeModel({ slot: "openrouter-free", model: "fast", modelId: ok }).id, ok);
  for (const bad of ["../x", "x".repeat(300), PAID[0], 7, null, "a/b", "a/b:free/../c", "/b:free", "a b/c:free"]) {
    assert.equal(nodeModel({ slot: "openrouter-free", model: "fast", modelId: bad }).id, FREE[0], String(bad));
  }
  // the paid slot ignores an override
  assert.equal(nodeModel({ slot: "openrouter", model: "fast", modelId: ok }).id, PAID[0]);
});

test("overrideIdOk: a free model id of at most 80 characters", () => {
  const table = [
    ["google/gemma-4-26b-a4b-it:free", true],
    ["Meta-Llama/Llama-4.1_x:FREE", true],
    ["a/b:free", true],
    ["deepseek/deepseek-v4-flash", false],
    ["a/b:free ", false],
    ["a//b:free", false],
    ["a/b:free:free", false],
    ["-a/b:free", false],
    [`a/${"b".repeat(78)}:free`, false],
    [undefined, false],
    [{}, false],
  ];
  for (const [id, want] of table) assert.equal(overrideIdOk(id), want, String(id));
});

test("fallback model stays inside the slot of the agent", () => {
  const f = fallbackModelFor({ slot: "openrouter-free", model: "fast" });
  assert.equal(f.key, "balanced");
  assert.equal(f.id, FREE[1]);
  assert.equal(fallbackModelFor({ slot: "openrouter", model: "strong" }).id, PAID[1]);
});

test("a key of Anthropic is refused for OpenRouter and an sk-or key is accepted", () => {
  assert.equal(keyShapeOk("openrouter", "sk-ant-api03-aaaaaaaaaaaaaaaaaaaaaaaa"), false);
  assert.equal(keyShapeOk("openrouter", "sk-or-v1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
});

test("the OpenRouter texts exist in both languages, differ, and the free ones do not name Google", () => {
  const keys = Object.values(PROVIDERS.openrouter.text).filter(Boolean);
  const extra = ["create.openrouterFree", "create.openrouterPaid", "create.estimateSearchOpenrouter", "editor.searchFeeOpenrouter"];
  for (const k of [...keys, ...extra]) {
    assert.ok(typeof en[k] === "string" && en[k].length > 0, `en ${k}`);
    assert.ok(typeof cs[k] === "string" && cs[k].length > 0, `cs ${k}`);
    if (!/^[A-Za-z]+$/.test(en[k])) assert.notEqual(en[k], cs[k], `cs differs ${k}`);
    const names = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort().join();
    assert.equal(names(en[k]), names(cs[k]), `params ${k}`);
  }
  for (const k of [PROVIDERS.openrouter.text.estimateFree, PROVIDERS.openrouter.text.freeWarning]) {
    assert.ok(!/Google|Gemini/.test(en[k]) && !/Google|Gemini/.test(cs[k]), k);
  }
});

// Guard: every place that reads the models of a provider by tier must go through the slot (modelsOfSlot, nodeModel, modelIdOf),
// or be on this list after someone has checked that it never reads an OpenRouter id. A new reader fails here, loudly.
test("source scan: reads of provider models without the slot are on the checked list", () => {
  const root = new URL("../public/js/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      statSync(p).isDirectory() ? walk(p) : p.endsWith(".js") && files.push(p);
    }
  };
  walk(root);
  const CHECKED = new Set([
    // the registry itself and the catalog that resolves the slot
    "engine/providers.js", "engine/catalog.js",
    // reads the labels, keys or tiers only (never an id): compare view, the library detail (run facts: labels of recorded models), definition and editor lists, patterns, guardrails
    "compare-view.js", "library-detail.js", "create/definition.js", "create/editor-view.js", "engine/patterns.js", "engine/guardrails.js",
    // the Gemini list of names and the shared model check (the catalog of ids to look for is built per slot by its caller)
    "engine/gemini.js", "engine/model-check.js",
    // read the registry model and then resolve it for the slot (resolveModel), or match both the paid and the free id, or only list ids for colour samples
    "engine/estimate.js", "replay/retry-choice.js", "provider-colors.js", "settings-page.js",
  ]);
  const pattern = /\.models\.find\(|\.models\[|\.models\.filter\(|\.models\.map\(|providerCatalog\([^)]*\)\.models|PROVIDERS\[[^\]]*\]\.models/;
  const offenders = [];
  for (const f of files) {
    const rel = f.slice(root.length).replace(/\\/g, "/").replace(/^\//, "");
    if (CHECKED.has(rel)) continue;
    const text = readFileSync(f, "utf8");
    if (pattern.test(text)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [], "these files read provider models without the slot; use modelsOfSlot or nodeModel");
});
