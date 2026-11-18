import test from "node:test";
import assert from "node:assert/strict";
import { createEditor, layoutDesign } from "../public/js/create/editor-model.js";
import { arrowsOf, autoPositions } from "../public/js/create/diagram-geometry.js";
import { flowState } from "../public/js/replay/flow.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { loadDefinition, buildDefinition } from "../public/js/create/definition.js";

const ids = (design) => design.nodes.map((n) => n.id);

test("a new map-reduce design starts with a splitter, a worker and a reducer in a line, and is valid", () => {
  const editor = createEditor("sequential");
  editor.reset("mapreduce");
  const design = editor.design();
  assert.deepEqual(ids(design), ["splitter", "worker", "reducer"]);
  assert.deepEqual(design.edges, [{ from: "splitter", to: "worker" }, { from: "worker", to: "reducer" }]);
  assert.deepEqual(validateDesign(design), { ok: true, errors: [] });
});

test("a new plan-and-execute design starts with a planner and an executor, and is valid", () => {
  const editor = createEditor("sequential");
  editor.reset("planexec");
  const design = editor.design();
  assert.deepEqual(ids(design), ["planner", "executor"]);
  assert.deepEqual(design.edges, [{ from: "planner", to: "executor" }]);
  assert.deepEqual(validateDesign(design), { ok: true, errors: [] });
});

test("in these two patterns no agent can be added twice, so the palette offers nothing more", () => {
  for (const pattern of ["mapreduce", "planexec"]) {
    const editor = createEditor("sequential");
    editor.reset(pattern);
    assert.deepEqual(editor.paletteFor().filter((p) => p.allowed).map((p) => p.agent), [], pattern);
    assert.equal(editor.addNode("worker").ok, false);
    assert.equal(editor.addNode("executor").ok, false);
  }
});

test("only the arrows of the line can be drawn again after one is removed", () => {
  const editor = createEditor("sequential");
  editor.reset("mapreduce");
  editor.disconnect("splitter", "worker");
  assert.deepEqual(editor.canConnect("worker", "splitter"), { ok: false, code: "map.edges" });
  assert.deepEqual(editor.canConnect("splitter", "reducer"), { ok: false, code: "map.edges" });
  assert.deepEqual(editor.canConnect("splitter", "worker"), { ok: true });
  const plan = createEditor("sequential");
  plan.reset("planexec");
  plan.disconnect("planner", "executor");
  assert.deepEqual(plan.canConnect("executor", "planner"), { ok: false, code: "plan.edges" });
  assert.deepEqual(plan.canConnect("planner", "executor"), { ok: true });
});

test("the evaluator loop starts with the self-critique switch off, and the switch is not in the design then", () => {
  const editor = createEditor("sequential");
  editor.reset("evaluator", { criteria: "x" });
  assert.equal(editor.selfCritique(), false);
  assert.equal("selfCritique" in editor.design(), false);
});

test("switching self-critique on leaves the writer alone, switching it off brings the evaluator back", () => {
  const editor = createEditor("sequential");
  editor.reset("evaluator", { criteria: "x" });
  editor.setSelfCritique(true);
  let design = editor.design();
  assert.equal(design.selfCritique, true);
  assert.deepEqual(ids(design), ["writer"]);
  assert.deepEqual(design.edges, []);
  assert.deepEqual(validateDesign(design), { ok: true, errors: [] });
  editor.setSelfCritique(false);
  design = editor.design();
  assert.deepEqual(ids(design), ["writer", "evaluator"]);
  assert.deepEqual(design.edges, [{ from: "writer", to: "evaluator" }]);
  assert.equal("selfCritique" in design, false);
  assert.deepEqual(validateDesign(design), { ok: true, errors: [] });
});

test("switching self-critique keeps the settings of the writer, the rounds and the criteria", () => {
  const editor = createEditor("sequential");
  editor.reset("evaluator", { criteria: "Short." });
  editor.setNode("writer", { search: true });
  editor.setRounds(2);
  editor.setSelfCritique(true);
  editor.setSelfCritique(false);
  const design = editor.design();
  assert.equal(design.nodes[0].search, true);
  assert.equal(design.rounds, 2);
  assert.equal(design.criteria, "Short.");
});

test("a pattern change turns the switch off", () => {
  const editor = createEditor("sequential");
  editor.reset("evaluator", { criteria: "x" });
  editor.setSelfCritique(true);
  editor.reset("evaluator", { criteria: "x" });
  assert.equal(editor.selfCritique(), false);
  assert.equal(editor.design().nodes.length, 2);
});

test("the switch does nothing outside the evaluator loop", () => {
  const editor = createEditor("sequential");
  editor.reset("voting");
  editor.setSelfCritique(true);
  assert.equal(editor.selfCritique(), false);
  assert.equal("selfCritique" in editor.design(), false);
});

test("a saved self-critique design loads back with the switch on", () => {
  const editor = createEditor("sequential");
  editor.reset("evaluator", { criteria: "Short." });
  editor.setSelfCritique(true);
  const loaded = loadDefinition(JSON.stringify(buildDefinition({ task: "t", design: editor.design() })));
  assert.equal(loaded.ok, true);
  assert.equal(loaded.editor.selfCritique(), true);
  assert.deepEqual(loaded.editor.design().nodes.map((n) => n.id), ["writer"]);
});

test("a saved map-reduce and plan-and-execute design load back", () => {
  for (const pattern of ["mapreduce", "planexec"]) {
    const editor = createEditor("sequential");
    editor.reset(pattern);
    const loaded = loadDefinition(JSON.stringify(buildDefinition({ task: "t", design: editor.design() })));
    assert.equal(loaded.ok, true, pattern);
    assert.deepEqual(loaded.editor.design().edges, editor.design().edges);
  }
});

test("both patterns are laid out left to right in the order of the line", () => {
  const editor = createEditor("sequential");
  editor.reset("mapreduce");
  const layout = layoutDesign(editor.design(), { orientation: "horizontal" });
  assert.deepEqual(layout.nodes.map((n) => [n.id, n.x]), [["splitter", 0], ["worker", 1], ["reducer", 2]]);
});

test("plan-and-execute and self-critique draw a dashed arc from the box back to itself", () => {
  const plan = createEditor("sequential");
  plan.reset("planexec");
  const planArrows = arrowsOf(plan.design(), autoPositions(plan.design(), { wide: true }));
  const planBack = planArrows.find((a) => a.kind === "return");
  assert.equal(planBack.key, "executor>executor");
  const self = createEditor("sequential");
  self.reset("evaluator", { criteria: "x" });
  self.setSelfCritique(true);
  const selfArrows = arrowsOf(self.design(), autoPositions(self.design(), { wide: true }));
  assert.equal(selfArrows.find((a) => a.kind === "return").key, "writer>writer");
  // map-reduce has no arc
  const map = createEditor("sequential");
  map.reset("mapreduce");
  assert.equal(arrowsOf(map.design(), autoPositions(map.design(), { wide: true })).filter((a) => a.kind === "return").length, 0);
});

test("the arrows of a run light by node: runs of a node count as the node", () => {
  const design = { pattern: "mapreduce", nodes: [{ id: "splitter" }, { id: "worker" }, { id: "reducer" }], edges: [] };
  const events = [
    { type: "handoff", from: "splitter", to: "worker#1" },
    { type: "handoff", from: "splitter", to: "worker#2" },
    { type: "handoff", from: "worker#2", to: "reducer" },
  ];
  const { used, latest } = flowState(events, 3, design);
  assert.deepEqual([...used].sort(), ["splitter>worker", "worker>reducer"]);
  assert.equal(latest.key, "worker>reducer");
  const plan = flowState([{ type: "handoff", from: "executor#1", to: "executor#2" }], 1, { pattern: "planexec", nodes: [] });
  assert.deepEqual([...plan.used], ["executor>executor"]);
});

test("the second call of a self-critique writer lights the arc of the writer", () => {
  const events = [{ type: "agent_start", agent: "writer" }, { type: "agent_start", agent: "writer", judging: true }];
  assert.deepEqual([...flowState(events, 1, { pattern: "evaluator", nodes: [] }).used], []);
  assert.deepEqual([...flowState(events, 2, { pattern: "evaluator", nodes: [] }).used], ["writer>writer"]);
});
