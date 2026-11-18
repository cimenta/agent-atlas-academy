import test from "node:test";
import assert from "node:assert/strict";
import { STEPS, emptyDecisions, taskDecided, stepStatus, navState, stepAfterChange, missing, footHint } from "../public/js/create/steps-model.js";
import { TASK_MAX_CHARS } from "../public/js/engine/catalog.js";

const all = () => ({ pattern: true, providers: true, model: true, memory: true, limits: { maxSteps: true, maxTokens: true, maxSearches: true } });
const status = (over = {}) => stepStatus({ task: "Explain tides", decisions: all(), nodeCount: 2, editorOk: true, keysReady: true, ...over });

test("a fresh page has every step undecided and steps 2 and 3 locked", () => {
  const s = stepStatus({ task: "", decisions: emptyDecisions(), nodeCount: 0, editorOk: false, keysReady: false });
  assert.equal(s.setup, "none");
  assert.deepEqual(s.locked, { diagram: true, check: true });
  assert.equal(s.ready, false);
  assert.deepEqual(STEPS, ["setup", "diagram", "check"]);
});

test("step 1 is part set until task, pattern, providers, model and memory are all decided", () => {
  const d = emptyDecisions();
  const at = (task) => stepStatus({ task, decisions: d, nodeCount: 0, editorOk: false, keysReady: false }).setup;
  assert.equal(at("Explain"), "part");
  d.pattern = true;
  d.providers = true;
  assert.equal(at("Explain"), "part");
  d.model = true;
  assert.equal(at("Explain"), "part");
  d.memory = true;
  assert.equal(at("Explain"), "done");
  assert.equal(at(""), "part");
});

test("a task of only spaces or over the maximum is not set", () => {
  assert.equal(taskDecided("   "), false);
  assert.equal(taskDecided("x".repeat(TASK_MAX_CHARS + 1)), false);
  assert.equal(taskDecided("x".repeat(TASK_MAX_CHARS)), true);
  assert.equal(taskDecided(undefined), false);
});

test("providers without a model, or a model without providers, leave the provider part unset", () => {
  const d = { ...emptyDecisions(), providers: true };
  const s = stepStatus({ task: "x", decisions: d, nodeCount: 0, editorOk: false, keysReady: false });
  assert.equal(s.parts.providerModel, false);
  assert.equal(s.parts.providers, true);
  assert.equal(s.parts.model, false);
});

test("steps 2 and 3 unlock only when step 1 is done", () => {
  assert.deepEqual(status().locked, { diagram: false, check: false });
  assert.deepEqual(status({ decisions: { ...all(), memory: false } }).locked, { diagram: true, check: true });
});

test("the diagram is done with agents and no errors, part with agents and errors, none with no agents", () => {
  assert.equal(status({ nodeCount: 0, editorOk: false }).diagram, "none");
  assert.equal(status({ nodeCount: 2, editorOk: false }).diagram, "part");
  assert.equal(status({ nodeCount: 2, editorOk: true }).diagram, "done");
});

test("step 3 is done only with all three limits decided and the keys ready, part with some, none with nothing", () => {
  const none = { maxSteps: false, maxTokens: false, maxSearches: false };
  assert.equal(status({ decisions: { ...all(), limits: none }, keysReady: false }).check, "none");
  assert.equal(status({ decisions: { ...all(), limits: { ...none, maxSteps: true } }, keysReady: false }).limits, "part");
  assert.equal(status({ decisions: { ...all(), limits: { ...none, maxSteps: true } }, keysReady: false }).check, "part");
  assert.equal(status({ keysReady: false }).check, "part");
  assert.equal(status({ keysReady: false }).key, "none");
  assert.equal(status().check, "done");
});

test("ready needs all three steps done", () => {
  assert.equal(status().ready, true);
  assert.equal(status({ nodeCount: 0, editorOk: false }).ready, false);
  assert.equal(status({ keysReady: false }).ready, false);
  assert.equal(status({ decisions: { ...all(), limits: { maxSteps: true, maxTokens: true, maxSearches: false } } }).ready, false);
});

test("Back is greyed on step 1, Next on the last step and while the next step is locked, and Run until ready", () => {
  const open = status();
  assert.deepEqual(navState({ step: "setup", status: open }), { back: false, next: true, run: true });
  assert.deepEqual(navState({ step: "diagram", status: open }), { back: true, next: true, run: true });
  assert.deepEqual(navState({ step: "check", status: open }), { back: true, next: false, run: true });
  const shut = status({ decisions: emptyDecisions() });
  assert.deepEqual(navState({ step: "setup", status: shut }), { back: false, next: false, run: false });
  assert.equal(navState({ step: "diagram", status: status({ nodeCount: 0, editorOk: false }) }).next, true);
});

test("stepAfterChange sends the student back to setup when the step became locked, and leaves an open one alone", () => {
  const shut = status({ decisions: emptyDecisions() });
  assert.equal(stepAfterChange("check", shut), "setup");
  assert.equal(stepAfterChange("diagram", shut), "setup");
  assert.equal(stepAfterChange("setup", shut), "setup");
  assert.equal(stepAfterChange("check", status()), "check");
});

test("missing lists what stops Run in order, and the hint follows", () => {
  const s = status({ nodeCount: 0, editorOk: false, keysReady: false, decisions: { ...all(), limits: { maxSteps: false, maxTokens: false, maxSearches: false } } });
  assert.deepEqual(missing(s), ["diagram", "limits", "key"]);
  assert.equal(footHint(s), "missing");
  assert.equal(footHint(status()), "ready");
  assert.deepEqual(missing(status()), []);
  assert.equal(footHint(status({ decisions: emptyDecisions() })), "setup");
});
