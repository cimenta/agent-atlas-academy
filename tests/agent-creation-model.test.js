import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateDesign } from "../public/js/engine/patterns.js";
import { validateRun } from "../public/js/run-schema.js";
import { CREATE_MAX, CREATOR_TYPES, NODE_MAX, INSTRUCTIONS_MAX } from "../public/js/engine/catalog.js";
import { createdId, createCapFor, designWithCreated } from "../public/js/engine/created.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const supervisorDesign = (creates, extraNodes = []) => ({
  pattern: "supervisor",
  nodes: [node("boss", "supervisor", creates === undefined ? {} : { creates }), node("w1", "researcher"), ...extraNodes],
  edges: [{ from: "boss", to: "w1" }],
});
const codes = (design) => validateDesign(design).errors.map((e) => e.code);

test("the constants of creating agents", () => {
  assert.equal(CREATE_MAX, 4);
  assert.deepEqual(CREATOR_TYPES, ["supervisor", "planner"]);
});

test("a supervisor may have the ability to create agents", () => {
  assert.equal(validateDesign(supervisorDesign({ max: 2, guidance: "", search: false })).ok, true);
  assert.equal(validateDesign(supervisorDesign({ max: 4, guidance: "small specialists", search: true })).ok, true);
});

test("a bad creates field is refused", () => {
  const bad = (creates) => assert.ok(codes(supervisorDesign(creates)).includes("node.creates"), JSON.stringify(creates));
  bad({ max: 0, guidance: "", search: false });
  bad({ max: 5, guidance: "", search: false });
  bad({ max: 1.5, guidance: "", search: false });
  bad({ max: 1, guidance: "", search: "yes" });
  bad({ max: 1, guidance: "x".repeat(INSTRUCTIONS_MAX + 1), search: false });
  bad({ max: 1, search: false });
  bad("on");
});

test("only a supervisor or a planner may create agents", () => {
  const design = { pattern: "supervisor", nodes: [node("boss", "supervisor"), node("w1", "researcher", { creates: { max: 1, guidance: "", search: false } })], edges: [{ from: "boss", to: "w1" }] };
  assert.ok(codes(design).includes("node.creates"));
});

test("a planner may create agents in plan-and-execute", () => {
  const design = { pattern: "planexec", nodes: [node("plan", "planner", { creates: { max: 2, guidance: "", search: false } }), node("exec", "executor")], edges: [{ from: "plan", to: "exec" }] };
  assert.equal(validateDesign(design).ok, true);
});

test("the designed agents and the cap never exceed the limit of the run", () => {
  const many = Array.from({ length: NODE_MAX - 2 }, (_, i) => node(`w${i + 2}`, "researcher"));
  const design = supervisorDesign({ max: 1, guidance: "", search: false }, many); // 1 boss + w1 + 6 = 8 nodes
  assert.equal(design.nodes.length, NODE_MAX);
  assert.ok(codes(design).includes("node.creates.total"));
});

test("how many agents may be created at most", () => {
  assert.equal(createCapFor(4), 4);
  assert.equal(createCapFor(6), 2);
  assert.equal(createCapFor(NODE_MAX), 0);
  assert.equal(createCapFor(NODE_MAX + 3), 0);
  assert.equal(createdId(3), "made-3");
});

test("designWithCreated adds the created agents known at the cursor", () => {
  const design = supervisorDesign({ max: 2, guidance: "", search: false });
  const made = { id: "made-1", agent: "free", name: "Fact checker", instructions: "Check.", model: "fast", search: false, created: true, by: "boss" };
  const events = [{ type: "run_start", t: 0 }, { type: "agent_created", t: 1, by: "boss", agent: "made-1", node: made, n: 1, max: 2 }, { type: "done", t: 2 }];
  assert.equal(designWithCreated(design, [events[0]]), design);
  assert.equal(designWithCreated(design, events, 1), design);
  const after = designWithCreated(design, events);
  assert.deepEqual(after.nodes.map((n) => n.id), ["boss", "w1", "made-1"]);
  assert.deepEqual(after.edges.at(-1), { from: "boss", to: "made-1" });
  assert.equal(design.nodes.length, 2);
});

const baseRun = (events) => ({
  schemaVersion: 1, id: "r1", title: "t", language: "en", pattern: "supervisor", appVersion: "1",
  recordedWith: { provider: "anthropic", model: "fast" },
  task: "x", design: supervisorDesign({ max: 1, guidance: "", search: false }), events, durationMs: 10,
});
const start = { type: "run_start", t: 0 };
const startA = (agent, t) => ({ type: "agent_start", t, agent });

test("the events of creating agents are accepted by the run schema", () => {
  const made = { id: "made-1", agent: "free", name: "A", instructions: "B", model: "fast", search: false, created: true, by: "boss" };
  const events = [start, startA("boss", 1), { type: "agent_created", t: 2, by: "boss", agent: "made-1", node: made, n: 1, max: 1 }, { type: "agent_refused", t: 3, by: "boss", reason: "cap" }, { type: "done", t: 4 }];
  const result = validateRun(baseRun(events));
  assert.deepEqual(result.errors, []);
});

test("a creation event needs its parts", () => {
  assert.equal(validateRun(baseRun([start, { type: "agent_created", t: 1, by: "boss", agent: "made-1" }, { type: "done", t: 2 }])).ok, false);
  assert.equal(validateRun(baseRun([start, { type: "agent_refused", t: 1, by: "boss" }, { type: "done", t: 2 }])).ok, false);
});

test("the new design errors have texts in both languages", () => {
  for (const lang of ["en", "cs"]) {
    const loc = JSON.parse(readFileSync(new URL(`../public/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(loc["design.error.node.creates"], `${lang} node.creates`);
    assert.ok(loc["design.error.node.creates.total"], `${lang} node.creates.total`);
  }
});
