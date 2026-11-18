import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runAllowed, stepStatus, emptyDecisions } from "../public/js/create/steps-model.js";
import { draft, resetDecisions, showKeyStep } from "../public/js/create/draft.js";
import { keepFocus } from "../public/js/create/keep-focus.js";
import { findSection } from "../public/js/help-topics.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));
const decided = { ...emptyDecisions(), pattern: true, providers: true, model: true, memory: true };
const ready = stepStatus({ task: "x", decisions: decided, nodeCount: 1, editorOk: true, keysReady: true });

test("Run is refused while a failed run waits to be carried on", () => {
  assert.equal(runAllowed({ status: ready, verdict: { ok: true }, retryPending: false }), true);
  assert.equal(runAllowed({ status: ready, verdict: { ok: true }, retryPending: true }), false);
  assert.equal(runAllowed({ status: ready, verdict: { ok: false }, retryPending: false }), false);
  assert.equal(runAllowed({ status: ready, verdict: null, retryPending: false }), false);
});

test("opening the key step unlocks it even when the definition of the run could not be loaded", () => {
  resetDecisions();
  showKeyStep();
  assert.equal(draft.step, "check");
  assert.equal(draft.subTab, "key");
  assert.deepEqual([draft.decisions.pattern, draft.decisions.providers, draft.decisions.model, draft.decisions.memory], [true, true, true, true]);
});

test("keepFocus gives the focus back to the same control after a redraw", () => {
  const made = { id: "a", focus() { made.focused = true; } };
  const doc = { activeElement: { id: "a" } };
  const host = { contains: (el) => el === doc.activeElement, querySelector: (sel) => (sel === "#a" ? made : null) };
  keepFocus(doc, host, () => {});
  assert.equal(made.focused, true);
  made.focused = false;
  doc.activeElement = { id: "" , getAttribute: (n) => (n === "data-ui" ? "pattern-x" : null) };
  host.querySelector = (sel) => (sel === '[data-ui="pattern-x"]' ? made : null);
  keepFocus(doc, host, () => {});
  assert.equal(made.focused, true);
  made.focused = false;
  doc.activeElement = { id: "zz" };
  host.contains = () => false;
  keepFocus(doc, host, () => {});
  assert.equal(made.focused, false);
});

test("only the right column inside the workspace is inert, and a locked one ignores the pointer", () => {
  const page = read("../public/js/create/create-page.js");
  assert.doesNotMatch(page, /rightColumn\.inert/);
  assert.match(page, /\.inert = locked/);
  assert.match(read("../public/styles.css"), /\.right-col\.locked \.inner \{[^}]*pointer-events: none/);
});

test("the workspace hint and the retry text read well in both languages", () => {
  assert.match(cs["create.ws.locked"], /čtyřech/);
  for (const loc of [en, cs]) assert.doesNotMatch(loc["create.retryNeedsKey"], /below|níže/);
});

test("Settings explains the Create layout in Help", () => {
  for (const [lang, loc] of [["en", en], ["cs", cs]]) {
    assert.ok(findSection(loc["help.body"], "settings-create"), `${lang}: no settings-create`);
    assert.ok(loc["settings.createHeading"], lang);
  }
  assert.match(read("../public/js/settings-page.js"), /settings-create/);
});

test("the workspace skips the step bar and footer", () => {
  assert.match(read("../public/js/create/create-page.js"), /const bar = workspace \? null/);
});

test("the connections list has a button, and starts hidden", () => {
  const view = read("../public/js/create/editor-view.js");
  assert.match(view, /let connectionsShown = false/);
  assert.match(view, /connections-toggle/);
  for (const loc of [en, cs]) assert.ok(loc["editor.showConnections"] && loc["editor.hideConnections"]);
  assert.notEqual(cs["editor.showConnections"], en["editor.showConnections"]);
});
