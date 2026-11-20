import { test } from "node:test";
import assert from "node:assert/strict";
import { makeBundle, readImportText, planImport } from "../public/js/run-bundle.js";

const run = (id, extra = {}) => ({
  schemaVersion: 1, id, title: `Run ${id}`, language: "en", pattern: "sequential",
  recordedWith: { provider: "anthropic", model: "x" }, appVersion: "1.0.0",
  events: [{ type: "done", outcome: "finished", usage: { input_tokens: 1, output_tokens: 1 }, t: 1 }],
  design: { pattern: "sequential", nodes: [{ id: "a", agent: "writer", model: "fast", search: false }], edges: [] },
  task: "Task", limits: { maxSteps: 20, maxTokens: 40000, maxSearches: 3 }, outcome: "finished", usage: { input_tokens: 1, output_tokens: 1 },
  client: { language: "cs", tz: "Europe/Prague" },
  ...extra,
});
let n = 0;
const makeId = () => `new-${++n}`;

test("makeBundle wraps runs in the bundle format and cleans each run like a single export", () => {
  const b = makeBundle([run("a"), run("b", { events: [{ type: "api_call", raw: { http: { headers: { "x-id": "1" } } }, t: 1 }, { type: "done", outcome: "finished", t: 2 }] })]);
  assert.equal(b.format, "agent-atlas-run-bundle");
  assert.equal(b.version, 1);
  assert.equal(b.runs.length, 2);
  assert.ok(b.runs.every((r) => r.client === undefined));
  assert.equal(b.runs[1].events[0].raw.http.headers, undefined);
});

test("readImportText refuses text that is not JSON and shapes that hold no runs", () => {
  assert.deepEqual(readImportText("not json"), { ok: false, reason: "json" });
  for (const text of ["[]", "null", "5", "{}", JSON.stringify({ format: "agent-atlas-run-bundle", version: 1, runs: "x" }), JSON.stringify({ format: "agent-atlas-run-bundle", version: 1, runs: [] })]) {
    const r = readImportText(text);
    assert.equal(r.ok, false, text);
    assert.ok(["invalid", "empty"].includes(r.reason), text);
  }
});

test("readImportText reads a bundle, and a plain run as a bundle of one", () => {
  const bundle = readImportText(JSON.stringify(makeBundle([run("a"), run("b")])));
  assert.equal(bundle.ok, true);
  assert.equal(bundle.runs.length, 2);
  const single = readImportText(JSON.stringify(run("a")));
  assert.equal(single.ok, true);
  assert.equal(single.runs.length, 1);
});

test("planImport skips equal runs, copies a changed one under a new id, adds new ones and refuses invalid ones", () => {
  const existing = [run("a"), run("b")];
  const plan = planImport([run("a"), run("b", { title: "Changed" }), run("c"), { id: "d", title: "no design" }], existing, makeId);
  assert.deepEqual(plan.map((p) => p.status), ["skipped", "copy", "added", "refused"]);
  assert.match(plan[1].run.id, /^new-/);
  assert.equal(plan[1].run.title, "Changed");
  assert.equal(plan[2].run.id, "c");
  assert.ok(plan[3].reason);
  assert.equal(plan[0].run, undefined);
});

test("planImport does not add the same id twice from one file", () => {
  const plan = planImport([run("x"), run("x")], [], makeId);
  assert.deepEqual(plan.map((p) => p.status), ["added", "skipped"]);
});

test("a copy keeps the same content apart from the id, and importing the plan twice adds nothing the second time", () => {
  const first = planImport([run("a", { title: "T" })], [run("a")], makeId);
  assert.equal(first[0].status, "copy");
  const saved = [run("a"), first[0].run];
  const second = planImport([run("a", { title: "T" })], saved, makeId);
  assert.equal(second[0].status, "skipped");
});

test("a bundle run whose id is a library id or cannot be opened by the router gets a fresh id and is saved as a copy", () => {
  const plan = planImport([run("sequential-simple"), run("My Run/../x"), run("fine-id")], [], makeId, new Set(["sequential-simple"]));
  assert.deepEqual(plan.map((p) => p.status), ["copy", "copy", "added"]);
  assert.ok(plan[0].run.id.startsWith("new-"));
  assert.ok(plan[1].run.id.startsWith("new-"));
  assert.equal(plan[2].run.id, "fine-id");
});
