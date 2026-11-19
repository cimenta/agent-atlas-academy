import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { buildResultModel } from "../public/js/play-model.js";
import { createdOf, refusalsOf, deriveInspector } from "../public/js/replay/inspect-model.js";
import { createdPanel } from "../public/js/replay/created-view.js";
import { createReplayDiagram } from "../public/js/replay/diagram.js";
import { freePlacesOf } from "../public/js/engine/created.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const design = (max = 3) => ({
  pattern: "supervisor",
  nodes: [node("boss", "supervisor", { creates: { max, guidance: "", search: false } }), node("researcher", "researcher")],
  edges: [{ from: "boss", to: "researcher" }],
});
async function record(d) {
  const events = [];
  await runDesign({ design: d, task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  return { design: d, events, recordedWith: { provider: "anthropic" } };
}
const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

test("the created agents at a cursor, with their state", async () => {
  const { events } = await record(design());
  const at = events.findIndex((e) => e.type === "agent_created");
  assert.ok(at > 0);
  assert.deepEqual(createdOf(events, at), []);
  const after = createdOf(events, at + 1);
  assert.equal(after.length, 1);
  assert.equal(after[0].id, "made-1");
  assert.equal(after[0].name, "Fact checker");
  assert.equal(after[0].by, "boss");
  assert.equal(after[0].max, 3);
  assert.equal(after[0].status, "waiting");
  assert.equal(createdOf(events)[0].status, "done");
  const working = events.findIndex((e) => e.type === "agent_start" && e.agent === "made-1");
  assert.equal(createdOf(events, working + 1)[0].status, "working");
});

test("the refusals at a cursor", () => {
  const events = [{ type: "run_start", t: 0 }, { type: "agent_refused", t: 1, by: "boss", reason: "cap" }, { type: "done", t: 2 }];
  assert.deepEqual(refusalsOf(events, 1), []);
  assert.deepEqual(refusalsOf(events, 2).map((r) => [r.by, r.reason]), [["boss", "cap"]]);
});

test("the inspector names a created agent and gives its creator a step", async () => {
  const { events } = await record(design());
  const state = deriveInspector(events);
  assert.equal(state.agents["made-1"].label, "Fact checker");
  const step = state.agents.boss.steps.find((s) => s.created === true);
  assert.equal(step.kind, "handoff");
  assert.equal(step.to, "made-1");
  assert.equal(step.title.key, "insp.createdTitle");
  assert.equal(step.title.params.name, "Fact checker");
  assert.ok(step.output.length > 0);
});

test("a refusal is a step of the creator", () => {
  const events = [{ type: "run_start", t: 0 }, { type: "agent_start", t: 1, agent: "boss" }, { type: "agent_refused", t: 2, by: "boss", reason: "cap" }, { type: "done", t: 3 }];
  const step = deriveInspector(events).agents.boss.steps.find((s) => s.refused === true);
  assert.equal(step.title.key, "insp.refused.cap");
});

test("the places still free", () => {
  const d = design(3);
  assert.deepEqual(freePlacesOf(d).map((p) => [p.by, p.n, p.max]), [["boss", 1, 3], ["boss", 2, 3], ["boss", 3, 3]]);
  const made = { id: "made-1", agent: "free", created: true, by: "boss", model: "fast", search: false, name: "A", instructions: "x" };
  const after = { ...d, nodes: [...d.nodes, made], edges: [...d.edges, { from: "boss", to: "made-1" }] };
  assert.deepEqual(freePlacesOf(after).map((p) => p.n), [2, 3]);
  assert.deepEqual(freePlacesOf({ ...d, nodes: d.nodes.map((n) => (n.creates ? { ...n, creates: undefined } : n)) }), []);
});

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
const walk = (el, out = []) => {
  out.push(el);
  for (const c of el?.children ?? []) if (c && typeof c === "object") walk(c, out);
  return out;
};
const ui = (el, name) => walk(el).filter((e) => (e.attrs?.["data-ui"] ?? e.attrs?.["data-ui"]) === name);

test("the diagram draws free places, and a created agent with its mark", () => {
  const d = design(3);
  const options = { wide: true, boxLabel: (id) => id, statusText: () => "", onSelect: () => {}, createdText: "created", freePlaceText: (n, max) => `free ${n} of ${max}` };
  const before = createReplayDiagram({ doc: fakeDoc(), design: d, ...options });
  assert.equal(ui(before.element, "free-place").length, 3);
  const made = { id: "made-1", agent: "free", created: true, by: "boss", model: "fast", search: false, name: "Fact checker", instructions: "x" };
  const after = createReplayDiagram({ doc: fakeDoc(), design: { ...d, nodes: [...d.nodes, made], edges: [...d.edges, { from: "boss", to: "made-1" }] }, ...options });
  assert.equal(ui(after.element, "free-place").length, 2);
  assert.equal(walk(after.element).filter((e) => e.attrs?.["data-created"] === "true").length, 1);
});

test("the Created agents panel lists them and the refusals", () => {
  const doc = fakeDoc();
  const t = (k, p) => (p ? `${k}${JSON.stringify(p)}` : k);
  const items = [{ id: "made-1", name: "Fact checker", instructions: "Check.", by: "boss", n: 1, max: 3, status: "working" }];
  const panel = createdPanel({ doc, t, items, refusals: [{ by: "boss", reason: "cap" }], max: 3, label: (id) => id, select: () => {} });
  assert.equal(panel.attrs["data-ui"], "created-panel");
  assert.equal(ui(panel, "created-item").length, 1);
  assert.equal(ui(panel, "created-refused").length, 1);
  assert.equal(createdPanel({ doc, t, items: [], refusals: [], max: 0, label: (id) => id, select: () => {} }), null);
});

test("the result of a run with a created agent counts its cost", async () => {
  const run = await record(design());
  const model = buildResultModel(run);
  assert.ok(model.perAgent.some((a) => a.agent === "made-1"));
  assert.ok(model.cost > 0);
});

test("the texts of the replay exist in both languages", () => {
  const keys = ["insp.createdTitle", "insp.createdIn", "insp.refused.not-allowed", "insp.refused.cap", "insp.refused.total", "insp.refused.name", "insp.refused.name-taken", "insp.refused.instructions", "player.createdHeading", "player.createdByHint", "player.createdOpen", "player.freePlace", "player.createdRefused", "player.created"];
  for (const k of keys) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
    assert.notEqual(cs[k], en[k], `cs ${k} is not translated`);
  }
});
