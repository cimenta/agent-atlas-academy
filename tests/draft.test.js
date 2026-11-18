import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { draft, draftHasWork, openInCreate, useDefinition, resetDecisions, decideLoaded } from "../public/js/create/draft.js";
import { definitionFromRun } from "../public/js/create/definition.js";
import { createEditor } from "../public/js/create/editor-model.js";

const run = JSON.parse(fs.readFileSync(new URL("../public/runs/sequential-simple.json", import.meta.url), "utf8"));
const reset = () => {
  draft.task = "";
  draft.pattern = "sequential";
  draft.editor = createEditor("sequential");
  resetDecisions();
};
const fakeDoc = (confirmAnswer) => {
  const calls = { confirm: 0 };
  return { calls, defaultView: { location: { hash: "" }, confirm: () => (calls.confirm++, confirmAnswer) } };
};

test("useDefinition fills the task, pattern and diagram from a run definition", () => {
  reset();
  assert.equal(draftHasWork(), false);
  assert.equal(useDefinition(definitionFromRun(run)), true);
  assert.equal(draft.task, run.task);
  assert.equal(draft.pattern, run.pattern);
  assert.equal(draft.editor.design().nodes.length, run.design.nodes.length);
  assert.equal(draftHasWork(), true);
});

test("useDefinition refuses something that is not a definition", () => {
  reset();
  assert.equal(useDefinition({ nonsense: true }), false);
  assert.equal(draftHasWork(), false);
});

test("openInCreate fills the draft and opens the Create tab without asking when the draft is empty", () => {
  reset();
  const doc = fakeDoc(false);
  assert.equal(openInCreate(doc, (k) => k, definitionFromRun(run)), true);
  assert.equal(doc.calls.confirm, 0);
  assert.equal(doc.defaultView.location.hash, "#/play/create");
  assert.equal(draft.task, run.task);
});

test("openInCreate asks before replacing work and keeps it when the visitor says no", () => {
  reset();
  draft.task = "my own task";
  const doc = fakeDoc(false);
  assert.equal(openInCreate(doc, (k) => k, definitionFromRun(run)), false);
  assert.equal(doc.calls.confirm, 1);
  assert.equal(draft.task, "my own task");
  assert.equal(doc.defaultView.location.hash, "");
});

test("a fresh draft has nothing decided except the limits, which come from Settings, and sits on the first step", () => {
  reset();
  assert.deepEqual(draft.decisions, { pattern: false, providers: false, model: false, memory: false, limits: { maxSteps: true, maxTokens: true, maxSearches: true } });
  assert.equal(draft.step, "setup");
  assert.equal(draft.subTab, "agents");
});

test("decideLoaded marks pattern, providers, model and memory and leaves the limits as they are", () => {
  reset();
  decideLoaded();
  assert.equal(draft.decisions.pattern && draft.decisions.providers && draft.decisions.model && draft.decisions.memory, true);
  assert.deepEqual(draft.decisions.limits, { maxSteps: true, maxTokens: true, maxSearches: true });
});

test("useDefinition counts as the student deciding", () => {
  reset();
  assert.equal(useDefinition(definitionFromRun(run)), true);
  assert.equal(draft.decisions.pattern, true);
  assert.equal(draft.decisions.limits.maxSteps, true);
});

test("resetDecisions clears every decision and goes back to the first step", () => {
  decideLoaded();
  draft.step = "check";
  resetDecisions();
  assert.equal(draft.decisions.pattern, false);
  assert.equal(draft.step, "setup");
});
