import test from "node:test";
import assert from "node:assert/strict";
import { buildResultModel, buildStatistics, limitRows } from "../public/js/play-model.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const mapDesign = (workerExtra = {}) => ({
  pattern: "mapreduce",
  nodes: [node("splitter", "splitter"), node("worker", "worker", workerExtra), node("reducer", "reducer")],
  edges: [{ from: "splitter", to: "worker" }, { from: "worker", to: "reducer" }],
});

async function record(design) {
  const events = [];
  await runDesign({ design, task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  return { design, events, recordedWith: { provider: "anthropic" } };
}

test("the cost of a worker run is priced with the model of its node, not the first model", async () => {
  const fast = await record(mapDesign());
  const strong = await record(mapDesign({ model: "strong" }));
  const f = buildResultModel(fast).cost;
  const s = buildResultModel(strong).cost;
  assert.ok(s > f, `strong worker ${s} should cost more than fast worker ${f}`);
});

test("the Statistics table gives a worker run the limits and the model of its node", async () => {
  const run = await record(mapDesign({ model: "strong", limits: { maxSteps: 3 } }));
  const stats = buildStatistics(run);
  const w = stats.perAgent.find((a) => a.agent === "worker#1");
  assert.deepEqual(w.limits, { maxSteps: 3 });
  assert.ok(w.model);
  const row = limitRows(stats).find((r) => r.id === "worker#1");
  assert.equal(row.own, true);
  assert.equal(row.cells.steps.limit, 3);
  assert.equal(row.cells.steps.from, "agent");
});

// ---- Retry on the box of a node that runs once for every part ----
function fakeDoc() {
  const make = (name) => ({
    name, attrs: {}, children: [], style: {}, listeners: {}, hidden: false, textContent: "",
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    append(...c) { this.children.push(...c); },
    replaceChildren(...c) { this.children = c; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
  });
  return { createElement: make, createElementNS: (ns, name) => make(name), createTextNode: (text) => ({ text }) };
}

test("a failed worker box offers Retry, and a working one does not", async () => {
  const { createReplayDiagram } = await import("../public/js/replay/diagram.js");
  const retried = [];
  const diagram = createReplayDiagram({ doc: fakeDoc(), design: mapDesign(), wide: true, boxLabel: (id) => id, statusText: (a) => a.status, onSelect: () => {}, onRetry: (id) => retried.push(id), clock: { setTimeout: () => 1, clearTimeout: () => {} } });
  const group = () => diagram.element.children[0].children.filter((c) => c.attrs?.class === "rnode-retry-group");
  const state = { agents: {} };
  const runs = (status) => new Map([["worker", { status, text: "x", badge: "×3" }]]);
  diagram.update({ events: [], cursor: 0, state, selectedId: null, badgeText: "", runs: runs("error") });
  assert.equal(group().filter((g) => !g.hidden).length, 1);
  group().find((g) => !g.hidden).children[0].listeners.click();
  assert.deepEqual(retried, ["worker"]);
  diagram.update({ events: [], cursor: 0, state, selectedId: null, badgeText: "", runs: runs("working") });
  assert.equal(group().filter((g) => !g.hidden).length, 0);
});

// ---- self-critique wording ----
import { loopOutcome } from "../public/js/replay/inspect-model.js";
import { loopNotice } from "../public/js/outcome-view.js";

test("the end notice of a self-critique loop never talks about an evaluator", async () => {
  const design = { pattern: "evaluator", nodes: [node("writer", "writer")], edges: [], rounds: 3, criteria: "x", selfCritique: true };
  const { events } = await record(design);
  const loop = loopOutcome(events);
  assert.equal(loop.self, true);
  const el = (tag, attrs, ...c) => ({ tag, attrs, children: c });
  const doc = { createElement: (tag) => ({ tag, attrs: {}, children: [], setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); }, get text() { return this.children.map((x) => x.text ?? x).join(""); } }), createTextNode: (text) => ({ text }) };
  const t = (key) => key;
  for (const result of ["accepted", "not_accepted", "stopped"]) {
    for (const judged of [true, false]) {
      assert.match(loopNotice({ doc, t, loop: { ...loop, result, judged } }).children.at(-1).text, /\.self/, `${result} ${judged}`);
    }
  }
  assert.doesNotMatch(loopNotice({ doc, t, loop: { ...loop, self: false, result: "accepted" } }).children.at(-1).text, /\.self/);
});

test("the self-critique notice texts exist in both languages", async () => {
  const { readFileSync } = await import("node:fs");
  for (const lang of ["en", "cs"]) {
    const d = JSON.parse(readFileSync(new URL(`../public/locales/${lang}.json`, import.meta.url), "utf8"));
    for (const k of ["loop.accepted.body.self", "loop.notAccepted.body.self", "loop.stopped.unjudged.self", "loop.stopped.judged.self"]) {
      assert.ok(typeof d[k] === "string" && d[k].length > 0, `${lang} ${k}`);
    }
  }
});

// ---- condensing never touches the instruction of a worker or an executor ----
import { mayCondense } from "../public/js/engine/condense.js";
import { activationsOf } from "../public/js/engine/estimate.js";

test("a worker and an executor are not condensed, because their input is their instruction; a reducer may be", () => {
  assert.equal(mayCondense("worker", "mapreduce"), false);
  assert.equal(mayCondense("executor", "planexec"), false);
  assert.equal(mayCondense("reducer", "mapreduce"), true);
});

test("the estimate counts the condensing call of a reducer", () => {
  const plain = activationsOf(mapDesign(), LIMIT_DEFAULTS);
  const withCondense = mapDesign();
  withCondense.nodes.find((n) => n.id === "reducer").condense = true;
  assert.equal(activationsOf(withCondense, LIMIT_DEFAULTS), plain + 1);
});
