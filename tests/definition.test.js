import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDefinition, definitionFromRun, loadDefinition, DEFINITION_FORMAT, DEFINITION_VERSION } from "../public/js/create/definition.js";
import { validateDesign } from "../public/js/engine/patterns.js";

import { createEditor } from "../public/js/create/editor-model.js";

// One small run of every pattern, built with the editor and shaped like a recorded run.
function runOf(pattern, agents, links) {
  const editor = createEditor(pattern);
  const ids = agents.map((a) => editor.addNode(a).id);
  for (const [from, to] of links) editor.connect(ids[from], ids[to]);
  const design = editor.design();
  return { id: "r-" + pattern, pattern, task: "Task for " + pattern, design, events: [{ t: 0, type: "run_start", task: "Task for " + pattern, pattern, design }] };
}
const runs = [
  runOf("sequential", ["researcher", "writer"], [[0, 1]]),
  runOf("parallel", ["researcher", "critic", "combiner"], [[0, 2], [1, 2]]),
  runOf("supervisor", ["supervisor", "researcher", "writer"], [[0, 1], [0, 2]]),
  runOf("debate", ["debater", "debater", "judge"], [[0, 2], [1, 2]]),
];

test("a run that did not record its design has no definition", () => {
  assert.equal(definitionFromRun({ events: [{ t: 0, type: "run_start", task: "x" }] }), null);
});

test("a definition holds the task and design of a run, nothing else", () => {
  const def = definitionFromRun(runs[0]);
  assert.equal(def.format, DEFINITION_FORMAT);
  assert.equal(def.version, DEFINITION_VERSION);
  assert.deepEqual(Object.keys(def).sort(), ["design", "format", "task", "version"]);
  assert.equal(def.task, runs[0].task ?? runs[0].events.find((e) => e.type === "run_start").task);
  assert.equal(JSON.stringify(def).includes("events"), false);
});

test("every sample run can be exported as a definition and loaded back unchanged", () => {
  for (const run of runs) {
    const loaded = loadDefinition(JSON.stringify(definitionFromRun(run)));
    assert.equal(loaded.ok, true, run.id);
    assert.equal(loaded.pattern, run.pattern);
    assert.deepEqual(loaded.editor.design(), definitionFromRun(run).design, run.id);
    assert.equal(validateDesign(loaded.editor.design()).ok, true);
  }
});

const sample = () => definitionFromRun(runs[0]);
const load = (def) => loadDefinition(JSON.stringify(def));

test("text that is not JSON, or not a definition, is refused", () => {
  assert.equal(loadDefinition("{oops").code, "notJson");
  assert.equal(loadDefinition("[]").code, "notDefinition");
  assert.equal(loadDefinition(JSON.stringify(runs[0])).code, "notDefinition");
  assert.equal(loadDefinition("x".repeat(300000)).code, "tooBig");
});

test("a definition from a newer version of the app says so", () => {
  assert.equal(load({ ...sample(), version: DEFINITION_VERSION + 1 }).code, "newer");
});

test("a design the editor would refuse is refused", () => {
  const def = sample();
  def.design.nodes[0].agent = "no-such-agent";
  assert.equal(load(def).code, "invalid");
  const noEdges = sample();
  noEdges.design.edges = [{ from: "ghost", to: "other" }];
  assert.equal(load(noEdges).code, "invalid");
  const empty = sample();
  empty.design.nodes = [];
  assert.equal(load(empty).ok, false);
});

test("an unknown model falls back to the default and the load says so", () => {
  const def = sample();
  def.design.nodes[0].model = "gpt-x";
  const loaded = load(def);
  assert.equal(loaded.ok, true);
  assert.ok(loaded.notes.includes("model"));
  assert.equal(validateDesign(loaded.editor.design()).ok, true);
});

test("a task that is too long is cut and the load says so", () => {
  const loaded = load({ ...sample(), task: "x".repeat(5000) });
  assert.equal(loaded.ok, true);
  assert.ok(loaded.notes.includes("taskCut"));
  assert.ok(loaded.task.length < 5000);
});

test("buildDefinition copies the design instead of sharing it", () => {
  const design = { pattern: "sequential", nodes: [], edges: [] };
  const def = buildDefinition({ task: "t", design });
  design.nodes.push({});
  assert.equal(def.design.nodes.length, 0);
});
