import { test } from "node:test";
import assert from "node:assert/strict";
import { compareFree, createFreeCheck, applyOverrides } from "../public/js/engine/free-check.js";
import { modelsOfSlot } from "../public/js/engine/providers.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { exportBackup, parseBackup, applyBackup } from "../public/js/storage/backup.js";
import { createMemoryBackend, createRunStore } from "../public/js/storage/runs-store.js";
import { createVault } from "../public/js/storage/key-vault.js";
import { createModelsHandler } from "../lib/models-handler.js";
import { cleanModelList } from "../public/js/engine/model-check.js";
import { nodeModel } from "../public/js/engine/catalog.js";

const FREE = ["google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3-ultra-550b-a55b:free"];
const slotModels = modelsOfSlot("openrouter-free");
const live = (ids, extra = []) => ({ ids: [...ids, ...extra.map((m) => m.id)], models: [...ids.map((id) => ({ id, name: id, tools: true, forcedFormat: true })), ...extra] });
const other = (id, name = id, tools = true) => ({ id, name, tools, forcedFormat: false });

test("all three free models present: ok, nothing gone", () => {
  const r = compareFree({ slotModels, live: live(FREE), overrides: {} });
  assert.equal(r.state, "ok");
  assert.deepEqual(r.gone, []);
});

test("one gone: the tier and its id are named, and the candidates are the live free models with tools", () => {
  const l = live([FREE[0], FREE[1]], [other("meta-llama/llama-4-scout:free", "Llama 4 Scout"), other("x/no-tools:free", "No tools", false), other("a/alpha:free", "Alpha")]);
  const r = compareFree({ slotModels, live: l, overrides: {} });
  assert.equal(r.state, "gone");
  assert.deepEqual(r.gone, [{ key: "strong", id: FREE[2] }]);
  assert.ok(!r.candidates.some((c) => c.id === "x/no-tools:free"));
  // ordered by name
  assert.deepEqual(r.candidates.map((c) => c.name), [...r.candidates.map((c) => c.name)].sort((a, b) => a.localeCompare(b)));
  assert.ok(r.candidates.find((c) => c.id === "meta-llama/llama-4-scout:free"));
  assert.equal(r.candidates.find((c) => c.id === "a/alpha:free").forcedFormat, false);
});

test("all gone gives three gone tiers", () => {
  const r = compareFree({ slotModels, live: live([], [other("a/b:free")]), overrides: {} });
  assert.equal(r.state, "gone");
  assert.deepEqual(r.gone.map((g) => g.key), ["fast", "balanced", "strong"]);
});

test("an override of a gone tier makes it ok; an override that is gone itself shows gone again", () => {
  const l = live([FREE[0], FREE[1]], [other("a/b:free")]);
  assert.equal(compareFree({ slotModels, live: l, overrides: { strong: "a/b:free" } }).state, "ok");
  const r = compareFree({ slotModels, live: l, overrides: { strong: "c/gone:free" } });
  assert.equal(r.state, "gone");
  assert.deepEqual(r.gone, [{ key: "strong", id: "c/gone:free" }]);
  // a bad override id is ignored: the registry id counts
  assert.deepEqual(compareFree({ slotModels, live: l, overrides: { strong: "../x" } }).gone, [{ key: "strong", id: FREE[2] }]);
});

test("a list that is garbage, empty or missing gives unknown", () => {
  for (const bad of [null, undefined, "x", {}, { ids: "no" }, { ids: [], models: [] }, { ids: [1, 2], models: "no" }]) {
    assert.equal(compareFree({ slotModels, live: bad, overrides: {} }).state, "unknown", JSON.stringify(bad));
  }
});

test("candidate names are cleaned and at most 80 characters; bad ids are dropped", () => {
  const l = live(FREE.slice(0, 2), [other("a/long:free", `Long\u0000name\n${"x".repeat(300)}`), other("bad id:free", "Bad"), other("../x:free", "Dots")]);
  const r = compareFree({ slotModels, live: l, overrides: {} });
  const long = r.candidates.find((c) => c.id === "a/long:free");
  assert.ok(long.name.length <= 80);
  assert.doesNotMatch(long.name, /[\u0000-\u001f]/);
  assert.ok(!r.candidates.some((c) => c.id === "bad id:free" || c.id === "../x:free"));
});

const okReply = (freeModels, ids = freeModels.map((m) => m.id)) => ({ ok: true, status: 200, json: async () => ({ ok: true, total: 100, ids: [], catalogFound: [], freeIds: ids, freeModels }) });

test("the check asks once in the time to live and again after it", async () => {
  let calls = 0;
  let t = 1000;
  const check = createFreeCheck({ fetchFn: async (url, init) => { calls += 1; assert.deepEqual(JSON.parse(init.body), { provider: "openrouter" }); return okReply(FREE.map((id) => ({ id, name: id, tools: true, forcedFormat: true }))); }, now: () => t, ttlMs: 1800000 });
  assert.equal(check.last(), null);
  const first = await check.run();
  assert.equal(first.ok, true);
  assert.deepEqual(first.live.ids, FREE);
  t += 1000;
  await check.run();
  assert.equal(calls, 1);
  assert.equal(check.last().at, 1000);
  t += 1800001;
  await check.run();
  assert.equal(calls, 2);
  await check.run({ force: true });
  assert.equal(calls, 3);
});

test("a failed, garbage or empty answer is unknown, and is asked again next time", async () => {
  const replies = [
    async () => ({ ok: false, status: 500, json: async () => ({ error: "unreachable" }) }),
    async () => { throw new Error("down"); },
    async () => ({ ok: true, status: 200, json: async () => "garbage" }),
    async () => ({ ok: true, status: 200, json: async () => ({ ok: true, freeIds: [], freeModels: [] }) }),
    async () => ({ ok: true, status: 200, json: async () => ({ ok: true, freeIds: "no", freeModels: 5 }) }),
  ];
  let i = 0;
  const check = createFreeCheck({ fetchFn: (...a) => replies[i++](...a), now: () => 5 });
  for (let n = 0; n < replies.length; n += 1) {
    const r = await check.run();
    assert.equal(r.ok, false, `case ${n}`);
    assert.equal(r.live, null);
  }
  assert.equal(i, replies.length);
});

test("the models route answers the free models for OpenRouter, cleaned and capped at 60", async () => {
  const entries = Array.from({ length: 90 }, (_, k) => ({ id: `v/m${String(k).padStart(2, "0")}:free`, name: `Model ${k}\u0007`, tools: k % 2 === 0, forcedFormat: false }));
  entries.push({ id: "v/paid-one", name: "Paid", tools: true, forcedFormat: true });
  const handler = createModelsHandler({ lists: { openrouter: async () => ({ ids: entries.map((e) => e.id), models: entries }) }, rateLimitImpl: () => true });
  const res = { statusCode: 0, chunks: [], setHeader() {}, end(c) { this.chunks.push(c); } };
  await handler({ method: "POST", headers: {}, body: { provider: "openrouter" } }, res);
  const data = JSON.parse(res.chunks.join(""));
  assert.equal(data.ok, true);
  assert.equal(data.freeModels.length, 60);
  assert.ok(data.freeModels.every((m) => m.id.endsWith(":free") && !/[\u0000-\u001f]/.test(m.name) && typeof m.tools === "boolean"));
  assert.equal(data.freeIds.length, 90);
  assert.ok(!data.freeIds.includes("v/paid-one"));
});

test("the free ids of the registry count as found in the catalog check", () => {
  const found = cleanModelList([...FREE, "deepseek/deepseek-v4-flash"], "openrouter").catalogFound;
  assert.deepEqual(found.sort(), [...FREE, "deepseek/deepseek-v4-flash"].sort());
});

const memoryStorage = () => {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => map.delete(k) };
};

test("setModelOverride keeps good overrides, refuses a bad id, an unknown slot or tier, and null removes", () => {
  const store = createSettingsStore(memoryStorage());
  assert.deepEqual(store.get().modelOverrides, {});
  store.setModelOverride("openrouter-free", "strong", "a/b:free");
  assert.deepEqual(store.get().modelOverrides, { "openrouter-free": { strong: "a/b:free" } });
  store.setModelOverride("openrouter-free", "strong", "../x");
  store.setModelOverride("openrouter-free", "strong", "deepseek/deepseek-v4-flash");
  store.setModelOverride("openrouter", "strong", "a/b:free");
  store.setModelOverride("groq-free", "strong", "a/b:free");
  store.setModelOverride("openrouter-free", "huge", "a/b:free");
  assert.deepEqual(store.get().modelOverrides, { "openrouter-free": { strong: "a/b:free" } });
  store.setModelOverride("openrouter-free", "fast", "c/d:free");
  store.setModelOverride("openrouter-free", "strong", null);
  assert.deepEqual(store.get().modelOverrides, { "openrouter-free": { fast: "c/d:free" } });
  store.setModelOverride("openrouter-free", "fast", null);
  assert.deepEqual(store.get().modelOverrides, {});
});

test("a stored override of a bad shape is dropped when the settings are read", () => {
  const storage = memoryStorage();
  storage.setItem("aa.settings", JSON.stringify({ modelOverrides: { "openrouter-free": { fast: "x/y:free", balanced: "../bad", strong: 5, huge: "a/b:free" }, groq: { fast: "a/b:free" }, nope: {} } }));
  assert.deepEqual(createSettingsStore(storage).get().modelOverrides, { "openrouter-free": { fast: "x/y:free" } });
});

test("applyOverrides writes modelId on the nodes of the free slot only, and leaves the design alone", () => {
  const node = (id, slot, model, extra = {}) => ({ id, agent: "writer", model, search: false, slot, ...extra });
  const design = { pattern: "sequential", nodes: [node("a", "openrouter-free", "strong"), node("b", "openrouter-free", "fast"), node("c", "groq-free", "strong"), node("d", "openrouter", "strong"), node("e", "openrouter-free", "balanced", { modelId: "stale/old:free" })], edges: [] };
  const copy = JSON.stringify(design);
  const out = applyOverrides(design, { "openrouter-free": { strong: "a/b:free", balanced: undefined } });
  assert.equal(JSON.stringify(design), copy);
  assert.equal(out.nodes[0].modelId, "a/b:free");
  assert.equal("modelId" in out.nodes[1], false);
  assert.equal("modelId" in out.nodes[2], false);
  assert.equal("modelId" in out.nodes[3], false);
  assert.equal("modelId" in out.nodes[4], false);
  assert.equal(nodeModel(out.nodes[0]).id, "a/b:free");
  assert.equal(applyOverrides(design, {}).nodes[0], design.nodes[0]);
});

test("overrides travel in a backup; an unknown slot or tier in a backup is ignored on apply", async () => {
  const store = createSettingsStore(memoryStorage());
  store.setModelOverride("openrouter-free", "balanced", "a/b:free");
  const backup = exportBackup({ runs: [], settings: store.get(), appVersion: "t" });
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true);
  const target = createSettingsStore(memoryStorage());
  const vault = createVault({ storage: memoryStorage(), iterations: 1000 });
  await applyBackup(parsed.backup, { runStore: createRunStore(createMemoryBackend()), settingsStore: target, vault, mode: "merge" });
  assert.deepEqual(target.get().modelOverrides, { "openrouter-free": { balanced: "a/b:free" } });
  const odd = { ...parsed.backup, settings: { modelOverrides: { "openrouter-free": { strong: "c/d:free", huge: "e/f:free" }, groq: { fast: "g/h:free" }, nope: { fast: "g/h:free" } } } };
  const third = createSettingsStore(memoryStorage());
  await applyBackup(odd, { runStore: createRunStore(createMemoryBackend()), settingsStore: third, vault, mode: "merge" });
  assert.deepEqual(third.get().modelOverrides, { "openrouter-free": { strong: "c/d:free" } });
  // an old backup without the field still applies
  await applyBackup({ backupVersion: 1, appVersion: "old", settings: {}, runs: [] }, { runStore: createRunStore(createMemoryBackend()), settingsStore: createSettingsStore(memoryStorage()), vault, mode: "merge" });
});

test("the detailed list reads tools and reply-format support from the supported parameters", async () => {
  const { listOpenrouterDetailed } = await import("../public/js/engine/openrouter.js");
  const rows = { data: [{ id: "a/b:free", name: "A B", supported_parameters: ["tools", "response_format"] }, { id: "c/d:free", name: "C D", supported_parameters: ["structured_outputs"] }, { id: "e/f", supported_parameters: "nope" }, null] };
  const out = await listOpenrouterDetailed({ fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => rows }) });
  assert.deepEqual(out.ids.slice(0, 3), ["a/b:free", "c/d:free", "e/f"]);
  assert.deepEqual(out.models.slice(0, 3).map((m) => [m.tools, m.forcedFormat]), [[true, true], [false, true], [false, false]]);
  assert.deepEqual((await listOpenrouterDetailed({ fetchImpl: async () => ({ ok: true, status: 200, headers: new Headers(), json: async () => ({}) }) })), { ids: [], models: [] });
});

test("a later failed check does not wipe what the last good check found: lastGood keeps it", async () => {
  const replies = [async () => okReply([{ id: "a/b:free", name: "n", tools: true, forcedFormat: true }]), async () => { throw new Error("offline"); }];
  let i = 0;
  const check = createFreeCheck({ fetchFn: (...a) => replies[i++](...a), now: () => 5 });
  await check.run();
  await check.run({ force: true });
  assert.equal(check.last().ok, false);
  assert.equal(check.lastGood().ok, true);
});
