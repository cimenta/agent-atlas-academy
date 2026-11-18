import { test } from "node:test";
import assert from "node:assert/strict";
import { differences, metricsRows, headline, finalText, MAX_COMPARE, MAX_SIDE } from "../public/js/compare-model.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "balanced", search: false, ...extra });
function rec({ id = "r", pattern = "sequential", nodes, limits = { maxSteps: 20, maxTokens: 40000, maxSearches: 3 }, task = "Compare", memory, events, provider = "anthropic", language = "en", durationMs, extraDesign = {} } = {}) {
  const ns = nodes ?? [node("researcher", "researcher"), node("writer", "writer")];
  const design = { pattern, nodes: ns, edges: ns.slice(1).map((n, i) => ({ from: ns[i].id, to: n.id })), ...(memory ? { memory } : {}), ...extraDesign };
  const evs = events ?? [
    { t: 0, type: "run_start", task, pattern, design },
    { t: 100, type: "agent_start", agent: ns[0].id, system: "s" },
    { t: 900, type: "round", agent: ns[0].id, round: 1, usage: { input: 100, output: 50 }, newMessages: [{ role: "user", content: `Task: ${task}` }], content: [{ type: "text", text: "x" }] },
    { t: 1000, type: "agent_output", agent: ns[0].id, text: "x", tokens: { input: 100, output: 50 } },
    { t: 1200, type: "done", outcome: "finished", finalText: "Final.", usage: { input: 100, output: 50, searches: 0, steps: 1 } },
  ];
  return { id, title: id, task, pattern, language, limits, design, events: evs, recordedWith: { provider }, durationMs };
}

test("constants", () => {
  assert.equal(MAX_COMPARE, 4);
  assert.equal(MAX_SIDE, 3);
});

test("differences lists only what differs and nothing for identical runs", () => {
  const out = differences([rec({ id: "a" }), rec({ id: "b" })]);
  assert.deepEqual(out.rows, []);
  assert.equal(out.tasksDiffer, false);
});

test("a model change is a row per agent", () => {
  const b = rec({ id: "b", nodes: [node("researcher", "researcher"), node("writer", "writer", { model: "strong" })] });
  const out = differences([rec({ id: "a" }), b]);
  assert.deepEqual(out.rows.map((r) => [r.id, r.kind, r.agent, r.values]), [["model:writer", "model", "writer", ["balanced", "strong"]]]);
});

test("an agent in only some runs is one agentPresence row and no per-agent rows", () => {
  const b = rec({ id: "b", nodes: [node("researcher", "researcher"), node("critic", "critic", { model: "fast" }), node("writer", "writer")] });
  const out = differences([rec({ id: "a" }), b]);
  const ids = out.rows.map((r) => r.id);
  assert.deepEqual(ids, ["agentPresence:critic"]);
  assert.deepEqual(out.rows[0].values, [false, true]);
});

test("notebook, per-agent choices and condensing show", () => {
  const a = rec({ id: "a" });
  const b = rec({ id: "b", memory: { notebook: true }, nodes: [node("researcher", "researcher", { notebook: "write" }), node("writer", "writer", { notebook: "read", condense: true })] });
  const out = differences([a, b]);
  const by = Object.fromEntries(out.rows.map((r) => [r.id, r.values]));
  assert.deepEqual(by["notebook"], [false, true]);
  assert.deepEqual(by["notebookChoice:researcher"], [null, "write"]);
  assert.deepEqual(by["notebookChoice:writer"], [null, "read"]);
  assert.deepEqual(by["condense:writer"], [false, true]);
});

test("limits and agent limits show by key", () => {
  const a = rec({ id: "a" });
  const b = rec({ id: "b", limits: { maxSteps: 12, maxTokens: 40000, maxSearches: 3, maxCostUsd: 0.5 }, nodes: [node("researcher", "researcher", { limits: { maxSteps: 3 } }), node("writer", "writer")] });
  const by = Object.fromEntries(differences([a, b]).rows.map((r) => [r.id, r.values]));
  assert.deepEqual(by["limit:maxSteps"], [20, 12]);
  assert.deepEqual(by["limit:maxCostUsd"], [null, 0.5]);
  assert.deepEqual(by["agentLimit:researcher:maxSteps"], [null, 3]);
  assert.equal("limit:maxTokens" in by, false);
});

test("pattern, language, provider, rounds and task differences", () => {
  const a = rec({ id: "a", task: "One" });
  const b = rec({ id: "b", task: "Two", pattern: "debate", language: "cs", provider: "google", extraDesign: { rounds: 3 } });
  const out = differences([a, b]);
  assert.equal(out.tasksDiffer, true);
  const by = Object.fromEntries(out.rows.map((r) => [r.id, r.values]));
  assert.deepEqual(by.pattern, ["sequential", "debate"]);
  assert.deepEqual(by.language, ["en", "cs"]);
  assert.deepEqual(by.provider, ["anthropic", "google"]);
  assert.deepEqual(by.task, ["One", "Two"]);
  assert.deepEqual(by.rounds, [null, 3]);
});

test("old recordings without memory, limits or provider compare without errors", () => {
  const old = { id: "o", title: "o", events: [{ t: 0, type: "done", outcome: "finished" }] };
  const out = differences([old, rec({ id: "b" })]);
  assert.ok(Array.isArray(out.rows));
  const m = metricsRows([old, rec({ id: "b" })]);
  assert.ok(m.every((row) => row.values.every((v) => v === null || typeof v === "number" || typeof v === "string")));
});

test("metricsRows: values and deltas against the first run", () => {
  const a = rec({ id: "a" });
  const bEvents = [
    { t: 0, type: "run_start", task: "Compare", design: a.design },
    { t: 900, type: "round", agent: "researcher", round: 1, usage: { input: 200, output: 50 }, newMessages: [], content: [] },
    { t: 1000, type: "agent_output", agent: "researcher", text: "x", tokens: { input: 200, output: 50 } },
    { t: 1500, type: "done", outcome: "finished", finalText: "F", usage: { input: 200, output: 50, searches: 0, steps: 1 } },
  ];
  const b = rec({ id: "b", events: bEvents });
  const rows = Object.fromEntries(metricsRows([a, b]).map((r) => [r.key, r]));
  assert.deepEqual(rows.input.values, [100, 200]);
  assert.equal(rows.input.deltas[0], null);
  assert.deepEqual(rows.input.deltas[1], { abs: 100, pct: 100 });
  assert.deepEqual(rows.ms.values, [1200, 1500]);
  assert.equal(rows.ms.deltas[1].pct, 25);
});

test("a zero or missing base gives no percentage, and an interrupted run has no NaN", () => {
  const a = rec({ id: "a" });
  const interrupted = rec({ id: "i", events: [{ t: 0, type: "run_start", task: "Compare", design: a.design }] });
  const rows = metricsRows([interrupted, a]);
  for (const row of rows) {
    for (const d of row.deltas) if (d) assert.ok(d.pct === null || Number.isFinite(d.pct));
    for (const v of row.values) if (typeof v === "number") assert.ok(Number.isFinite(v));
  }
  const notes = rows.find((r) => r.key === "notes");
  assert.equal(notes.deltas[1].pct, null);
});

test("outcome has no deltas", () => {
  const row = metricsRows([rec({ id: "a" }), rec({ id: "b" })]).find((r) => r.key === "outcome");
  assert.deepEqual(row.values, ["finished", "finished"]);
  assert.deepEqual(row.deltas, [null, null]);
});

test("headline and finalText", () => {
  const a = rec({ id: "a" });
  const b = rec({ id: "b", nodes: [node("researcher", "researcher"), node("writer", "writer", { model: "strong" })] });
  const h = headline([a, b]);
  assert.deepEqual(h.changed, ["model:writer"]);
  assert.ok(h.cost === null || Number.isFinite(h.cost));
  assert.equal(finalText(a), "Final.");
  assert.equal(finalText({ events: [{ type: "agent_output", agent: "x", text: "Last" }] }), "Last");
  assert.equal(finalText({ events: [] }), null);
  assert.equal(finalText(undefined), null);
});
