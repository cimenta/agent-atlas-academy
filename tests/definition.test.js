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

// The folder is the owner's working material, so missing or empty is fine; whatever is there must load.
test("every definition file in demo-definitions loads", async () => {
  const { readFileSync, readdirSync, existsSync } = await import("node:fs");
  const dir = new URL("../demo-definitions/", import.meta.url);
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".json")) : [];
  for (const f of files) assert.equal(loadDefinition(readFileSync(new URL(f, dir), "utf8")).ok, true, f);
});

test("a critic that adds its notes to the previous output keeps that setting through a definition", () => {
  const editor = createEditor("sequential");
  const a = editor.addNode("researcher").id;
  const b = editor.addNode("critic", { addToPrevious: true }).id;
  editor.connect(a, b);
  const design = editor.design();
  const def = buildDefinition({ task: "t", design });
  const loaded = loadDefinition(JSON.stringify(def));
  assert.equal(loaded.ok, true);
  assert.equal(loaded.editor.design().nodes[1].addToPrevious, true);
});

test("an evaluator loop keeps its criteria and rounds through save and load", () => {
  const editor = createEditor("evaluator");
  editor.reset("evaluator", { criteria: "Cite a source." });
  editor.setRounds(2);
  const design = editor.design();
  const run = { id: "r-ev", pattern: "evaluator", task: "T", design, events: [{ t: 0, type: "run_start", task: "T", pattern: "evaluator", design }] };
  const loaded = loadDefinition(JSON.stringify(buildDefinition({ task: "T", design })));
  assert.equal(loaded.ok, true);
  assert.equal(loaded.editor.design().criteria, "Cite a source.");
  assert.equal(loaded.editor.design().rounds, 2);
});

// ---- handoff ----
test("a handoff definition keeps its start through save and load; an old one without start starts with the first agent", () => {
  const editor = createEditor("handoff");
  const a = editor.addNode("planner").id;
  const b = editor.addNode("writer").id;
  editor.connect(a, b);
  editor.connect(b, a);
  editor.setStart(b);
  const text = JSON.stringify(buildDefinition({ task: "t", design: editor.design() }));
  const loaded = loadDefinition(text);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.editor.start(), b);
  const old = JSON.parse(text);
  delete old.design.start;
  const again = loadDefinition(JSON.stringify(old));
  assert.equal(again.ok, true);
  assert.equal(again.editor.start(), a);
});

test("a definition keeps the notebook switch and the choice of each agent", () => {
  const editor = createEditor("sequential");
  editor.setNotebook(true);
  const a = editor.addNode("researcher").id;
  const b = editor.addNode("writer").id;
  editor.connect(a, b);
  editor.setNode(a, { notebook: "write" });
  editor.setNode(b, { notebook: "read" });
  const text = JSON.stringify(buildDefinition({ task: "t", design: editor.design() }));
  const loaded = loadDefinition(text);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.editor.notebookOn(), true);
  assert.deepEqual(loaded.editor.design().nodes.map((n) => n.notebook), ["write", "read"]);
});

test("a definition keeps the condense flag of an agent", () => {
  const design = { pattern: "sequential", nodes: [{ id: "a", agent: "researcher", model: "fast", search: false }, { id: "b", agent: "writer", model: "fast", search: false, condense: true }], edges: [{ from: "a", to: "b" }] };
  const out = loadDefinition(JSON.stringify({ format: DEFINITION_FORMAT, version: DEFINITION_VERSION, task: "t", design }));
  assert.equal(out.ok, true);
  assert.equal(out.editor.design().nodes.find((n) => n.agent === "writer").condense, true);
  assert.equal("condense" in out.editor.design().nodes.find((n) => n.agent === "researcher"), false);
});

test("a definition keeps its About text and picks the language of the run", async () => {
  const { aboutForLanguage } = await import("../public/js/create/definition.js");
  const about = { en: { title: "T", description: "English" }, cs: { title: "Č", description: "Česky", junk: "x" } };
  const design = { pattern: "sequential", nodes: [{ id: "a", agent: "writer", model: "fast", search: false }], edges: [] };
  const loaded = loadDefinition(JSON.stringify(buildDefinition({ task: "t", design, about })));
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.about.cs, { title: "Č", description: "Česky" });
  assert.equal(aboutForLanguage(loaded.about, "cs").title, "Č");
  assert.equal(aboutForLanguage(loaded.about, "de").title, "T");
  assert.deepEqual(aboutForLanguage({ title: "Flat" }, "cs"), { title: "Flat" });
  assert.equal(loadDefinition(JSON.stringify(buildDefinition({ task: "t", design }))).about, null);
});

test("a run record carries the About text and a definition made from it does too", async () => {
  const { buildRunRecord } = await import("../public/js/engine/run-record.js");
  const { validateRun } = await import("../public/js/run-schema.js");
  const design = { pattern: "sequential", nodes: [{ id: "a", agent: "writer", model: "fast", search: false }], edges: [] };
  const events = [{ type: "run_start", t: 0, task: "t", pattern: "sequential", design }, { type: "done", t: 1, outcome: "finished" }];
  const record = buildRunRecord({ id: "r-1", design, task: "t", events, limits: {}, language: "en", appVersion: "0", about: { title: "T", description: "D" } });
  assert.deepEqual(record.about, { title: "T", description: "D" });
  assert.equal(validateRun(record).ok, true);
  assert.deepEqual(definitionFromRun(record).about, { title: "T", description: "D" });
  assert.equal("about" in buildRunRecord({ id: "r-2", design, task: "t", events, limits: {}, language: "en", appVersion: "0" }), false);
});

test("every provider test definition has an About text in English and Czech that differ", async () => {
  const { readFileSync } = await import("node:fs");
  for (const provider of ["groq", "openrouter", "cloudflare"]) {
    for (const kind of ["simple", "429"]) {
      const loaded = loadDefinition(readFileSync(new URL(`../demo-definitions/${provider}-${kind}.json`, import.meta.url), "utf8"));
      assert.equal(loaded.ok, true, `${provider}-${kind}`);
      assert.ok(loaded.about.en.title && loaded.about.en.description, `${provider}-${kind} en`);
      assert.ok(loaded.about.cs.title && loaded.about.cs.description, `${provider}-${kind} cs`);
      assert.notEqual(loaded.about.en.description, loaded.about.cs.description);
      for (const node of loaded.editor.design().nodes) assert.equal(node.slot, `${provider}-free`);
    }
  }
});
