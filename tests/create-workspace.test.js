import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workspaceLocked, stepStatus, emptyDecisions } from "../public/js/create/steps-model.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const decided = () => ({ pattern: true, providers: true, model: true, memory: true, limits: { maxSteps: true, maxTokens: true, maxSearches: true } });

test("the right column of the workspace is locked until the four parts of step 1 are decided", () => {
  assert.equal(workspaceLocked(stepStatus({ task: "", decisions: emptyDecisions(), nodeCount: 0, editorOk: false, keysReady: false })), true);
  assert.equal(workspaceLocked(stepStatus({ task: "x", decisions: { ...decided(), memory: false }, nodeCount: 0, editorOk: false, keysReady: false })), true);
  assert.equal(workspaceLocked(stepStatus({ task: "x", decisions: decided(), nodeCount: 0, editorOk: false, keysReady: false })), false);
});

test("the page builds the workspace shell from the layout setting and keeps the locked column out of reach", () => {
  const source = read("../public/js/create/create-page.js");
  assert.match(source, /createLayout === "workspace"/);
  assert.match(source, /data-ui": "ws-left"/);
  assert.match(source, /data-ui": "ws-right"/);
  assert.match(source, /\.inert = /);
  assert.match(source, /workspaceLocked\(/);
  assert.match(source, /create\.ws\.locked/);
});

test("the workspace has no step heading over the checks and no diagram heading", () => {
  const source = read("../public/js/create/create-page.js");
  assert.match(source, /workspace \? "" : h\(doc, "h3", \{\}, t\("create\.step\.check"\)/);
  assert.match(source, /workspace \? \[\] : \[h\(doc, "h3", \{\}, t\("create\.step\.diagram"\)/);
});
