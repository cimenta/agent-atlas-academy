import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agentTabIds, currentAgentTab } from "../public/js/create/agent-tabs.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the settings of an agent have the tabs Tools, Condense, Approval and Limits, and Notebook only when the notebook is on", () => {
  assert.deepEqual(agentTabIds({ notebookOn: false }), ["tools", "condense", "approval", "limits"]);
  assert.deepEqual(agentTabIds({ notebookOn: true }), ["tools", "condense", "approval", "notebook", "limits"]);
});

test("a tab that is not there any more falls back to the first one", () => {
  assert.equal(currentAgentTab("notebook", agentTabIds({ notebookOn: false })), "tools");
  assert.equal(currentAgentTab("limits", agentTabIds({ notebookOn: false })), "limits");
  assert.equal(currentAgentTab(undefined, agentTabIds({ notebookOn: true })), "tools");
});

test("the editor shows the settings in tabs and the tab names exist in both languages", () => {
  const source = read("../public/js/create/editor-view.js");
  assert.match(source, /agentTabIds\(/);
  assert.match(source, /innerTabs\(/);
  for (const l of ["en", "cs"]) {
    const d = JSON.parse(read(`../public/locales/${l}.json`));
    assert.ok(d["editor.tab.limits"], `${l} editor.tab.limits`);
  }
});

test("the prompt of the agent comes before the tabs and Remove sits in the heading line", () => {
  const source = read("../public/js/create/editor-view.js");
  assert.ok(source.indexOf('"data-ui": "agent-prompt"') < source.indexOf("agentTabIds({"), "prompt after the tabs");
  assert.match(source, /editor-settings-head/);
  assert.doesNotMatch(source, /parts\.push\(remove\)/);
});
