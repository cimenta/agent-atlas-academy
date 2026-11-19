import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agentTabIds } from "../public/js/create/agent-tabs.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const KEYS = ["editor.tab.format", "editor.formatHeading", "editor.format", "editor.formatHint", "editor.formatFields", "editor.formatNamePlaceholder", "editor.formatType.text", "editor.formatType.number", "editor.formatType.yesno", "editor.formatType.list", "editor.formatAdd", "editor.formatRemove", "editor.formatPreviewHeading", "editor.formatRepairHint", "editor.formatOn", "editor.formatOff", "editor.formatNameHint", "design.error.node.format"];

test("the tab Format comes after Limits and before Creating, and only when the agent may have a format", () => {
  assert.deepEqual(agentTabIds({ notebookOn: false, formatOk: true }), ["tools", "condense", "approval", "limits", "format"]);
  assert.deepEqual(agentTabIds({ notebookOn: false, creator: true, formatOk: true }), ["tools", "condense", "approval", "limits", "format", "creates"]);
  assert.deepEqual(agentTabIds({ notebookOn: false }), ["tools", "condense", "approval", "limits"]);
});

test("the editor builds the Format pane with the controls of the mockup", () => {
  const source = read("../public/js/create/editor-view.js");
  for (const id of ["format-on", "format-add", "format-preview", "format-name-", "format-type-", "format-remove-"]) assert.ok(source.includes(`"data-ui": "${id}`) || source.includes(`\`${id}`), id);
  assert.match(source, /formatOk: mayFormat\(/);
  assert.match(source, /id: "answer-format"/);
  assert.match(source, /formatPromptText\(/);
});

test("every text of the tab exists in English and Czech, and the Czech differs", () => {
  const en = JSON.parse(read("../public/locales/en.json"));
  const cs = JSON.parse(read("../public/locales/cs.json"));
  for (const key of KEYS) {
    assert.ok(en[key], `en ${key}`);
    assert.ok(cs[key], `cs ${key}`);
  }
  assert.notEqual(cs["editor.format"], en["editor.format"]);
  assert.notEqual(cs["editor.formatHint"], en["editor.formatHint"]);
});
