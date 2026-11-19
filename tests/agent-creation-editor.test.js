import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEditor } from "../public/js/create/editor-model.js";
import { agentTabIds } from "../public/js/create/agent-tabs.js";
import { loadDefinition, buildDefinition } from "../public/js/create/definition.js";
import { findSection } from "../public/js/help-topics.js";
import { NODE_MAX } from "../public/js/engine/catalog.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const on = (max = 2, guidance = "", search = false) => ({ max, guidance, search });
const supervisorEditor = () => {
  const e = createEditor("supervisor");
  e.reset("supervisor");
  e.addNode("researcher");
  return e;
};
const link = (e) => { for (const n of e.design().nodes) if (n.agent !== "supervisor") e.connect(boss(e).id, n.id); };
const boss = (e) => e.design().nodes.find((n) => n.agent === "supervisor");

test("the Creating tab is the last one and only for a supervisor or a planner", () => {
  assert.deepEqual(agentTabIds({ notebookOn: false, creator: true }), ["tools", "condense", "approval", "limits", "creates"]);
  assert.deepEqual(agentTabIds({ notebookOn: true, creator: true }), ["tools", "condense", "approval", "notebook", "limits", "creates"]);
  assert.deepEqual(agentTabIds({ notebookOn: false }), ["tools", "condense", "approval", "limits"]);
});

test("the ability is set on a supervisor and cleared with null", () => {
  const e = supervisorEditor();
  e.setNode(boss(e).id, { creates: on(2, "small specialists", true) });
  assert.deepEqual(boss(e).creates, { max: 2, guidance: "small specialists", search: true });
  e.setNode(boss(e).id, { creates: null });
  assert.equal("creates" in boss(e), false);
});

test("the ability is refused for other agents", () => {
  const e = supervisorEditor();
  const worker = e.design().nodes.find((n) => n.agent === "researcher");
  e.setNode(worker.id, { creates: on() });
  assert.equal("creates" in e.design().nodes.find((n) => n.id === worker.id), false);
});

test("a planner may have it in plan-and-execute", () => {
  const e = createEditor("planexec");
  e.reset("planexec");
  const planner = e.design().nodes.find((n) => n.agent === "planner");
  e.setNode(planner.id, { creates: on(3) });
  assert.equal(e.design().nodes.find((n) => n.agent === "planner").creates.max, 3);
  assert.deepEqual(e.errors(), []);
});

test("the cap is kept within 1 and the room the run has", () => {
  const e = supervisorEditor(); // 2 agents: room 4
  e.setNode(boss(e).id, { creates: on(9) });
  assert.equal(boss(e).creates.max, 4);
  e.setNode(boss(e).id, { creates: on(0) });
  assert.equal(boss(e).creates.max, 1);
  e.setNode(boss(e).id, { creates: { max: "x", guidance: 5, search: "yes" } });
  assert.deepEqual(boss(e).creates, { max: 1, guidance: "", search: false });
});

test("adding agents shrinks the cap and removes the ability when no room is left", () => {
  const e = supervisorEditor();
  e.setNode(boss(e).id, { creates: on(4) });
  e.addNode("writer");
  e.addNode("critic"); // 4 agents: room 4
  assert.equal(boss(e).creates.max, 4);
  e.addNode("free"); // 5 agents: room 3
  assert.equal(boss(e).creates.max, 3);
  while (e.design().nodes.length < NODE_MAX) e.addNode("free");
  assert.equal("creates" in boss(e), false);
  link(e);
  assert.deepEqual(e.errors(), []);
});

test("changing the pattern drops the ability", () => {
  const e = supervisorEditor();
  e.setNode(boss(e).id, { creates: on() });
  e.reset("parallel");
  assert.ok(e.design().nodes.every((n) => !("creates" in n)));
});

test("a design with the ability is saved in a definition and loaded again", () => {
  const e = supervisorEditor();
  e.setNode(boss(e).id, { creates: on(3, "prefer specialists", true) });
  link(e);
  const text = JSON.stringify(buildDefinition({ task: "x", design: e.design() }));
  const loaded = loadDefinition(text);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.editor.design().nodes.find((n) => n.agent === "supervisor").creates, { max: 3, guidance: "prefer specialists", search: true });
});

test("the pane is wired in the editor and its texts exist in both languages", () => {
  const view = read("../public/js/create/editor-view.js");
  for (const id of ["creates-on", "ed-creates-max", "ed-creates-guidance", "creates-search", "agent-pane-creates"].slice(0, 4)) assert.ok(view.includes(id), id);
  assert.ok(view.includes("agentTabIds({ notebookOn: editor.notebookOn(), creator })"));
  const keys = ["editor.tab.creates", "editor.creatingHeading", "editor.creates", "editor.createsHint", "editor.createsCap", "editor.createsMaxHint", "editor.createsGuidance", "editor.createsGuidancePlaceholder", "editor.createsSearch", "editor.createsSearchHint", "editor.createsOn", "editor.createsOff", "editor.createsNoRoom"];
  const en = JSON.parse(read("../public/locales/en.json"));
  const cs = JSON.parse(read("../public/locales/cs.json"));
  for (const k of keys) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
    assert.notEqual(cs[k], en[k], `cs ${k} is not translated`);
    assert.doesNotMatch(en[k], /learner/i);
  }
});

test("the Help section Creating agents exists in both languages", () => {
  for (const lang of ["en", "cs"]) {
    const loc = JSON.parse(read(`../public/locales/${lang}.json`));
    const found = findSection(loc["help.body"], "create-creating");
    assert.ok(found, `${lang}: no create-creating`);
    for (const id of found.section.related) assert.ok(findSection(loc["help.body"], id), `${lang}: related ${id}`);
  }
});
