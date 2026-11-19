import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createEditor } from "../public/js/create/editor-model.js";
import { loadDefinition, buildDefinition } from "../public/js/create/definition.js";
import { agentTabIds } from "../public/js/create/agent-tabs.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const GR = [{ where: "output", kind: "secret", onFail: "repair" }];
const nodeOf = (e, id) => e.design().nodes.find((n) => n.id === id);

test("the tab Guardrails comes after Format and before Creating, only when the agent may have guardrails", () => {
  assert.deepEqual(agentTabIds({ notebookOn: false, formatOk: true, guardrailsOk: true }), ["tools", "condense", "approval", "limits", "format", "guardrails"]);
  assert.deepEqual(agentTabIds({ notebookOn: true, creator: true, formatOk: true, guardrailsOk: true }), ["tools", "condense", "approval", "notebook", "limits", "format", "guardrails", "creates"]);
  assert.deepEqual(agentTabIds({ notebookOn: false }), ["tools", "condense", "approval", "limits"]);
});

test("the editor keeps cleaned guardrails and removes them on null or an empty list", () => {
  const e = createEditor("sequential");
  const id = e.addNode("writer").id;
  e.setNode(id, { guardrails: [{ where: "input", kind: "words", onFail: "repair", words: [" Foo ", "foo", "bar"] }, { where: "output", kind: "reviewer", onFail: "stop", policy: " be kind " }] });
  assert.deepEqual(nodeOf(e, id).guardrails, [
    { where: "input", kind: "words", onFail: "stop", words: ["Foo", "bar"] },
    { where: "output", kind: "reviewer", onFail: "stop", policy: "be kind", model: "fast" },
  ]);
  e.setNode(id, { guardrails: [] });
  assert.equal("guardrails" in nodeOf(e, id), false);
  e.setNode(id, { guardrails: GR });
  e.setNode(id, { guardrails: null });
  assert.equal("guardrails" in nodeOf(e, id), false);
});

test("guardrails on an agent that may not have them are not kept", () => {
  const sup = createEditor("supervisor");
  const boss = sup.addNode("supervisor", { guardrails: GR }).id;
  assert.equal("guardrails" in nodeOf(sup, boss), false);
  const hand = createEditor("handoff");
  const a = hand.addNode("writer", { guardrails: GR }).id;
  assert.equal("guardrails" in nodeOf(hand, a), false);
  const ok = createEditor("sequential");
  const w = ok.addNode("writer", { guardrails: GR }).id;
  assert.deepEqual(nodeOf(ok, w).guardrails, GR);
});

test("a definition keeps valid guardrails and drops invalid ones", () => {
  const e = createEditor("sequential");
  const id = e.addNode("writer").id;
  e.setNode(id, { guardrails: GR });
  const loaded = loadDefinition(JSON.stringify(buildDefinition({ task: "x", design: e.design() })));
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.editor.design().nodes[0].guardrails, GR);
  const raw = buildDefinition({ task: "x", design: e.design() });
  raw.design.nodes[0].guardrails = [{ where: "nowhere", kind: "nope", onFail: "x" }];
  const again = loadDefinition(JSON.stringify(raw));
  assert.equal(again.ok, true);
  assert.equal("guardrails" in again.editor.design().nodes[0], false);
});

test("the editor builds the Guardrails pane with the controls of the mockup", () => {
  const source = read("../public/js/create/editor-view.js");
  for (const id of ["guardrails-add", "guardrail-where-", "guardrail-kind-", "guardrail-onfail-", "guardrail-words-", "guardrail-max-", "guardrail-policy-", "guardrail-model-", "guardrail-remove-"]) assert.ok(source.includes(`"data-ui": "${id}`) || source.includes(`\`${id}`), id);
  assert.match(source, /guardrailsOk: mayGuard\(/);
  assert.match(source, /GUARDRAIL_MAX/);
});

const KEYS = ["editor.tab.guardrails", "editor.guardrailsHeading", "editor.guardrailsHint", "editor.guardrailsAdd", "editor.guardrailRemove", "editor.guardrailTitle", "editor.guardrail.where.output", "editor.guardrail.where.input", "editor.guardrail.kind.secret", "editor.guardrail.kind.words", "editor.guardrail.kind.length", "editor.guardrail.kind.reviewer", "editor.guardrail.onFail.repair", "editor.guardrail.onFail.stop", "editor.guardrail.onFail.flag", "editor.guardrail.onFailLabel", "editor.guardrail.hint.secret", "editor.guardrail.hint.words", "editor.guardrail.hint.length", "editor.guardrail.hint.reviewer", "editor.guardrail.hint.input", "editor.guardrail.wordsLabel", "editor.guardrail.maxLabel", "editor.guardrail.policyLabel", "editor.guardrail.modelLabel", "editor.guardrailsOn", "editor.guardrailsOff", "editor.guardrailsEstimate"];

test("every text of the tab exists in English and Czech, and the Czech differs", () => {
  const en = JSON.parse(read("../public/locales/en.json"));
  const cs = JSON.parse(read("../public/locales/cs.json"));
  for (const key of KEYS) {
    assert.ok(en[key], `en ${key}`);
    assert.ok(cs[key], `cs ${key}`);
    assert.notEqual(cs[key], en[key], `cs ${key} is not translated`);
  }
});
