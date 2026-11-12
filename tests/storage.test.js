import { test } from "node:test";
import assert from "node:assert/strict";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { createMemoryBackend, createRunStore, createBatchedSaver } from "../public/js/storage/runs-store.js";
import { buildRunRecord } from "../public/js/engine/run-record.js";
import { LIMIT_DEFAULTS, LIMIT_MAX } from "../public/js/engine/catalog.js";

const design = {
  pattern: "sequential",
  nodes: [
    { id: "planner", agent: "planner", model: "fast", search: false },
    { id: "writer", agent: "writer", model: "fast", search: false },
  ],
  edges: [{ from: "planner", to: "writer" }],
};

function makeRun(id, { text = "ok", task = "A task" } = {}) {
  const events = [
    { t: 0, type: "run_start", task, pattern: "sequential", design },
    { t: 1, type: "agent_start", agent: "planner", role: "Planner" },
    { t: 2, type: "agent_output", agent: "planner", text, tokens: { input: 5, output: 5 } },
    { t: 3, type: "done", outcome: "finished", usage: { input: 5, output: 5, searches: 0, steps: 1 }, finalText: text },
  ];
  return buildRunRecord({ id, design, task, events, limits: LIMIT_DEFAULTS, language: "en", appVersion: "0.3.0" });
}

let tick = 1000;
const store = (backend = createMemoryBackend()) => createRunStore(backend, { now: () => (tick += 10) });

test("save then get returns the same run", async () => {
  const s = store();
  const run = makeRun("local-a");
  assert.deepEqual(await s.save(run), { ok: true });
  assert.deepEqual(await s.get("local-a"), run);
});

test("list is newest first and has the summary fields", async () => {
  const s = store();
  await s.save(makeRun("local-1", { task: "First" }));
  await s.save(makeRun("local-2", { task: "Second" }));
  const list = await s.list();
  assert.deepEqual(list.map((r) => r.id), ["local-2", "local-1"]);
  assert.deepEqual(Object.keys(list[0]).sort(), ["createdAt", "id", "outcome", "pattern", "title"]);
  assert.equal(typeof list[0].createdAt, "number");
  assert.equal(list[0].title, "Second");
});

test("saving the same id again keeps the original createdAt", async () => {
  const s = store();
  await s.save(makeRun("local-1"));
  const first = (await s.list())[0].createdAt;
  await s.save(makeRun("local-1", { text: "newer" }));
  assert.equal((await s.list())[0].createdAt, first);
  assert.equal((await s.list()).length, 1);
});

test("an invalid run is rejected and not stored", async () => {
  const s = store();
  const bad = { ...makeRun("local-x"), events: [] };
  assert.deepEqual(await s.save(bad), { ok: false, reason: "invalid" });
  assert.deepEqual(await s.list(), []);
});

test("a run over 2 MB is rejected as too_large", async () => {
  const s = store();
  const result = await s.save(makeRun("local-big", { text: "x".repeat(3 * 1024 * 1024) }));
  assert.deepEqual(result, { ok: false, reason: "too_large" });
  assert.equal(await s.get("local-big"), undefined);
});

test("a backend that throws gives storage and save does not throw", async () => {
  const backend = { ...createMemoryBackend(), put: async () => { throw new Error("quota"); } };
  const result = await store(backend).save(makeRun("local-q"));
  assert.deepEqual(result, { ok: false, reason: "storage" });
});

test("markup in text is stored and returned unchanged as data", async () => {
  const s = store();
  const run = makeRun("local-xss", { text: "<script>alert(1)</script>" });
  await s.save(run);
  const back = await s.get("local-xss");
  assert.equal(back.events[2].text, "<script>alert(1)</script>");
});

test("remove and clear work", async () => {
  const s = store();
  await s.save(makeRun("local-1"));
  await s.save(makeRun("local-2"));
  await s.remove("local-1");
  assert.deepEqual((await s.list()).map((r) => r.id), ["local-2"]);
  await s.clear();
  assert.deepEqual(await s.list(), []);
});

test("the batched saver writes at most once per interval and exactly the latest on flush", async () => {
  const puts = [];
  const backend = createMemoryBackend();
  const original = backend.put.bind(backend);
  backend.put = async (record) => {
    puts.push(record);
    return original(record);
  };
  let pending = null;
  const clock = {
    setTimeout: (fn) => {
      pending = fn;
      return 1;
    },
    clearTimeout: () => {
      pending = null;
    },
  };
  const s = store(backend);
  const saver = createBatchedSaver(s, { intervalMs: 2000, clock });
  for (let i = 0; i < 20; i++) saver.update(makeRun("local-live", { text: `v${i}` }));
  assert.equal(puts.length, 0);
  await pending();
  assert.equal(puts.length, 1);
  saver.update(makeRun("local-live", { text: "last" }));
  await saver.flush();
  assert.equal(puts.length, 2);
  assert.equal((await s.get("local-live")).events[2].text, "last");
  await saver.flush();
  assert.equal(puts.length, 2);
});

test("settings: defaults when empty, clamped when out of range, defaults when malformed", () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const settings = createSettingsStore(storage);
  assert.deepEqual(settings.get().limits, LIMIT_DEFAULTS);
  settings.setLimits({ maxSteps: 5, maxTokens: 10_000_000, maxSearches: 2 });
  assert.deepEqual(settings.get().limits, { maxSteps: 5, maxTokens: LIMIT_MAX.maxTokens, maxSearches: 2 });
  data.set("aa.settings", "{broken");
  assert.deepEqual(settings.get().limits, LIMIT_DEFAULTS);
});

test("settings: tooltips are on by default, can be turned off, and keep the limits", () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const settings = createSettingsStore(storage);
  assert.equal(settings.get().tooltips, true);
  settings.setLimits({ maxSteps: 5, maxTokens: 1000, maxSearches: 1 });
  settings.setTooltips(false);
  assert.equal(settings.get().tooltips, false);
  assert.equal(settings.get().limits.maxSteps, 5);
  settings.setLimits({ maxSteps: 6, maxTokens: 1000, maxSearches: 1 });
  assert.equal(settings.get().tooltips, false);
  settings.setTooltips(true);
  assert.equal(settings.get().tooltips, true);
});

test("settings: does not throw when storage throws", () => {
  const storage = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  const settings = createSettingsStore(storage);
  assert.deepEqual(settings.get().limits, LIMIT_DEFAULTS);
  assert.doesNotThrow(() => settings.setLimits({ maxSteps: 3 }));
});

test("settings: the player layout is the side column by default and can be switched to the bar", () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const settings = createSettingsStore(storage);
  assert.equal(settings.get().playerLayout, "side");
  settings.setPlayerLayout("bar");
  assert.equal(settings.get().playerLayout, "bar");
  settings.setTooltips(false);
  assert.equal(settings.get().playerLayout, "bar");
  settings.setPlayerLayout("nonsense");
  assert.equal(settings.get().playerLayout, "side");
});
