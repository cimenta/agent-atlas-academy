import { test } from "node:test";
import assert from "node:assert/strict";
import { importFiles } from "../public/js/library-import.js";
import { makeBundle } from "../public/js/run-bundle.js";
import { createMemoryBackend, createRunStore } from "../public/js/storage/runs-store.js";

const run = (id, task = "task " + id) => ({
  schemaVersion: 1,
  id,
  title: task,
  language: "en",
  pattern: "sequential",
  recordedWith: { provider: "groq", model: "m" },
  appVersion: "0.0.0",
  design: { pattern: "sequential", nodes: [{ id: "a", agent: "worker" }], edges: [] },
  events: [{ type: "run_start", t: 0, task, pattern: "sequential", design: { nodes: [], edges: [] } }, { type: "done", t: 1, outcome: "finished" }],
  outcome: "finished",
  apiCalls: [],
});
const newStore = () => createRunStore(createMemoryBackend(), { now: () => 1000 });
let n = 0;
const makeId = () => `local-new-${++n}`;
const file = (name, data) => ({ name, text: typeof data === "string" ? data : JSON.stringify(data) });

test("a bundle of three: one new is added, one already there is skipped, one invalid is refused, and only the new one is saved", async () => {
  const runStore = newStore();
  await runStore.save(run("have"));
  const bad = { ...run("bad"), events: "nope" };
  const result = await importFiles([file("b.json", makeBundle([run("have"), run("fresh"), bad]))], { runStore, makeId });
  assert.deepEqual(result.counts, { added: 1, skipped: 1, copy: 0, refused: 1 });
  assert.deepEqual(result.rows.map((r) => r.status), ["skipped", "added", "refused"]);
  assert.ok(result.rows.every((r) => r.file === "b.json"));
  assert.equal((await runStore.list()).length, 2);
});

test("a plain run file is added under a fresh id", async () => {
  const runStore = newStore();
  const result = await importFiles([file("one.json", run("from-elsewhere"))], { runStore, makeId });
  assert.equal(result.counts.added, 1);
  assert.equal(result.rows[0].id, "local-new-" + n);
  assert.ok(await runStore.get(result.rows[0].id));
});

test("two files with the same run give added, then skipped", async () => {
  const runStore = newStore();
  const result = await importFiles([file("a.json", makeBundle([run("x")])), file("b.json", makeBundle([run("x")]))], { runStore, makeId });
  assert.deepEqual(result.rows.map((r) => r.status), ["added", "skipped"]);
});

test("a save that fails keeps the runs saved before and reports the rest as refused with the reason", async () => {
  const real = newStore();
  let calls = 0;
  const runStore = { list: () => real.list(), get: (id) => real.get(id), save: async (r) => (++calls === 2 ? { ok: false, reason: "storage" } : real.save(r)) };
  const result = await importFiles([file("b.json", makeBundle([run("one"), run("two"), run("three")]))], { runStore, makeId });
  assert.deepEqual(result.rows.map((r) => r.status), ["added", "refused", "added"]);
  assert.equal(result.rows[1].reason, "storage");
  assert.deepEqual(result.counts, { added: 2, skipped: 0, copy: 0, refused: 1 });
});

test("a file that is not JSON, or not a run, is one refused row that names the file", async () => {
  const result = await importFiles([file("x.txt", "{oops"), file("y.json", "[1,2]")], { runStore: newStore(), makeId });
  assert.deepEqual(result.rows.map((r) => [r.file, r.status, r.reason]), [["x.txt", "refused", "json"], ["y.json", "refused", "invalid"]]);
  assert.equal(result.counts.refused, 2);
});

test("an import still reports a refused row for every run when the store cannot be listed", async () => {
  const runStore = { list: async () => { throw new Error("blocked"); }, get: async () => null, save: async () => ({ ok: true }) };
  const result = await importFiles([file("b.json", makeBundle([run("one")]))], { runStore, makeId });
  assert.equal(result.counts.refused, 1);
  assert.equal(result.rows[0].reason, "storage");
});

test("the same large bundle imported twice is skipped the second time even when the store trimmed the logs", async () => {
  const runStore = newStore();
  const big = { ...run("big"), apiCalls: [] };
  const stripped = { ...run("big"), apiCallsDropped: true };
  await runStore.save(stripped);
  const result = await importFiles([file("b.json", makeBundle([big]))], { runStore, makeId });
  assert.deepEqual(result.rows.map((r) => r.status), ["skipped"]);
});

test("an empty runs list is reported as empty, not as a missing design", async () => {
  const result = await importFiles([file("e.json", { format: "agent-atlas-run-bundle", version: 1, runs: [] })], { runStore: newStore(), makeId });
  assert.equal(result.rows[0].reason, "empty");
});
