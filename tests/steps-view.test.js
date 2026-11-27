import test from "node:test";
import assert from "node:assert/strict";
import { statusIcon, stepBar, footer, innerTabs, workspaceBar } from "../public/js/create/steps-view.js";
import { stepStatus, emptyDecisions } from "../public/js/create/steps-model.js";

function fakeDoc() {
  const make = (name) => ({
    name, attrs: {}, children: [], listeners: {}, disabled: false, hidden: false,
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    append(...c) { this.children.push(...c); },
    replaceChildren(...c) { this.children = c; },
    addEventListener(type, fn) { this.listeners[type] = fn; },
    click() { this.listeners.click?.(); },
  });
  return { createElement: make, createElementNS: (ns, name) => make(name), createTextNode: (text) => ({ text }) };
}
const textOf = (n) => (n.text !== undefined ? n.text : (n.children ?? []).map(textOf).join(""));
const find = (n, pred, out = []) => {
  if (pred(n)) out.push(n);
  for (const c of n.children ?? []) find(c, pred, out);
  return out;
};
const t = (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key);
const doc = fakeDoc();
const open = () => stepStatus({ task: "x", decisions: { pattern: true, providers: true, model: true, memory: true, limits: { maxSteps: true, maxTokens: true, maxSearches: true } }, nodeCount: 2, editorOk: true, keysReady: true });
const shut = () => stepStatus({ task: "", decisions: emptyDecisions(), nodeCount: 0, editorOk: false, keysReady: false });

test("a status icon carries its state and an accessible label", () => {
  for (const [state, label] of [["none", "create.status.none"], ["part", "create.status.part"], ["done", "create.status.done"], ["lock", "create.status.locked"]]) {
    const el = statusIcon(doc, state, t);
    assert.equal(el.getAttribute("data-s"), state);
    assert.equal(el.getAttribute("role"), "img");
    assert.equal(el.getAttribute("aria-label"), label);
  }
});

test("a locked step button is disabled and shows the lock, an open one does not", () => {
  const bar = stepBar({ doc, t, status: shut(), current: "setup", onGo: () => {} });
  const buttons = find(bar.element, (n) => n.name === "button");
  assert.equal(buttons.length, 3);
  assert.deepEqual(buttons.map((b) => b.disabled), [false, true, true]);
  assert.deepEqual(buttons.map((b) => find(b, (n) => n.attrs?.["data-s"]).at(0).attrs["data-s"]), ["none", "lock", "lock"]);
  assert.equal(buttons[1].getAttribute("title"), "create.step.locked");
  assert.equal(buttons[0].getAttribute("aria-selected"), "true");
  bar.update(open(), "check");
  const after = find(bar.element, (n) => n.name === "button");
  assert.deepEqual(after.map((b) => b.disabled), [false, false, false]);
  assert.deepEqual(after.map((b) => b.getAttribute("aria-selected")), ["false", "false", "true"]);
  assert.deepEqual(after.map((b) => find(b, (n) => n.attrs?.["data-s"]).at(0).attrs["data-s"]), ["done", "done", "done"]);
});

test("clicking an open step calls onGo with its name, a locked one does not", () => {
  const went = [];
  const bar = stepBar({ doc, t, status: shut(), current: "setup", onGo: (s) => went.push(s) });
  const buttons = find(bar.element, (n) => n.name === "button");
  buttons[1].click();
  assert.deepEqual(went, []);
  bar.update(open(), "setup");
  find(bar.element, (n) => n.name === "button")[1].click();
  assert.deepEqual(went, ["diagram"]);
});

test("the steps are numbered", () => {
  const bar = stepBar({ doc, t, status: open(), current: "setup", onGo: () => {} });
  const labels = find(bar.element, (n) => n.name === "button").map(textOf);
  assert.ok(labels[0].includes("1. create.step.setup"));
  assert.ok(labels[2].includes("3. create.step.check"));
});

test("the footer greys Back, Next and Run from the state, shows the hint and calls the handlers", () => {
  const calls = [];
  const foot = footer({ doc, t, onBack: () => calls.push("back"), onNext: () => calls.push("next"), onRun: () => calls.push("run") });
  const btn = (ui) => find(foot.element, (n) => n.attrs?.["data-ui"] === ui)[0];
  foot.update({ nav: { back: false, next: true, run: false }, hint: "create.hint.setup" });
  assert.equal(btn("step-back").disabled, true);
  assert.equal(btn("step-next").disabled, false);
  assert.equal(btn("run-button").disabled, true);
  assert.equal(textOf(find(foot.element, (n) => n.attrs?.["data-ui"] === "step-hint")[0]), "create.hint.setup");
  foot.update({ nav: { back: true, next: false, run: true }, hint: "create.hint.ready" });
  assert.deepEqual([btn("step-back").disabled, btn("step-next").disabled, btn("run-button").disabled], [false, true, false]);
  btn("step-back").click();
  btn("step-next").click();
  btn("run-button").click();
  assert.deepEqual(calls, ["back", "next", "run"]);
});

test("the inner tabs mark the chosen one and show the status of the tabs that have one", () => {
  const picked = [];
  const tabs = innerTabs({ doc, t, tabs: [{ id: "agents", label: "A" }, { id: "limits", label: "L", state: "part" }], current: "agents", onSelect: (id) => picked.push(id) });
  const buttons = find(tabs.element, (n) => n.attrs?.role === "tab");
  assert.deepEqual(buttons.map((b) => b.getAttribute("aria-selected")), ["true", "false"]);
  assert.equal(find(buttons[1], (n) => n.attrs?.["data-s"]).at(0).attrs["data-s"], "part");
  assert.equal(find(buttons[0], (n) => n.attrs?.["data-s"]).length, 0);
  buttons[1].click();
  assert.deepEqual(picked, ["limits"]);
  tabs.update("limits", { limits: "done" });
  const again = find(tabs.element, (n) => n.attrs?.role === "tab");
  assert.deepEqual(again.map((b) => b.getAttribute("aria-selected")), ["false", "true"]);
  assert.equal(find(again[1], (n) => n.attrs?.["data-s"]).at(0).attrs["data-s"], "done");
});

import { partHeading } from "../public/js/create/steps-view.js";

test("a part heading shows its icon, its text, its help button and a right-aligned extra, and the icon can change", () => {
  const help = doc.createElement("button");
  const extra = doc.createElement("button");
  const part = partHeading({ doc, t, state: "none", text: "2. Pattern", help: [help], extra });
  assert.equal(part.element.name, "h3");
  assert.ok(textOf(part.element).includes("2. Pattern"));
  assert.ok(find(part.element, (n) => n === help).length === 1);
  const side = find(part.element, (n) => n.attrs?.class === "part-extra")[0];
  assert.ok(side.children.includes(extra));
  assert.equal(find(part.element, (n) => n.attrs?.["data-s"])[0].attrs["data-s"], "none");
  part.setState("done");
  assert.equal(find(part.element, (n) => n.attrs?.["data-s"])[0].attrs["data-s"], "done");
});

// ---- the workspace bar of layout B ----
const chips = (bar) => find(bar.element, (n) => n.attrs?.["data-ui"] === "workspace-chip");

test("the workspace bar shows the lock on Diagram and Check and a greyed Run while step 1 is not decided", () => {
  const bar = workspaceBar({ doc, t, onRun: () => {} });
  bar.update({ status: shut(), estimate: "", hint: "h", runEnabled: false });
  const icons = chips(bar).map((c) => find(c, (n) => n.attrs?.["data-s"] !== undefined)[0].getAttribute("data-s"));
  assert.deepEqual(icons, ["none", "lock", "lock"]);
  assert.equal(find(bar.element, (n) => n.attrs?.["data-ui"] === "run-button")[0].disabled, true);
  assert.equal(textOf(find(bar.element, (n) => n.attrs?.["data-ui"] === "workspace-estimate")[0]), "create.ws.noEstimate");
});

test("the workspace bar enables Run when everything is ready and Run calls onRun once", () => {
  let runs = 0;
  const bar = workspaceBar({ doc, t, onRun: () => runs++ });
  bar.update({ status: open(), estimate: "$0.0012 to $0.0042", hint: "ready", runEnabled: true });
  const run = find(bar.element, (n) => n.attrs?.["data-ui"] === "run-button")[0];
  assert.equal(run.disabled, false);
  run.click();
  assert.equal(runs, 1);
  assert.match(textOf(find(bar.element, (n) => n.attrs?.["data-ui"] === "workspace-estimate")[0]), /\$0\.0012/);
  assert.equal(textOf(bar.hintElement), "ready");
  assert.equal(find(bar.element, (n) => n.attrs?.["data-ui"] === "step-hint").length, 0);
});

test("updating the workspace bar twice keeps one Run button", () => {
  const bar = workspaceBar({ doc, t, onRun: () => {} });
  bar.update({ status: open(), estimate: "", hint: "a", runEnabled: true });
  bar.update({ status: shut(), estimate: "", hint: "b", runEnabled: false });
  assert.equal(find(bar.element, (n) => n.attrs?.["data-ui"] === "run-button").length, 1);
});

test("every open step that has help shows its help mark, a locked step does not", () => {
  const help = { diagram: "create-diagram", check: "create-run" };
  const bar = stepBar({ doc, t, status: open(), current: "setup", onGo: () => {}, help });
  const ids = () => find(bar.element, (n) => n.attrs?.class?.includes("step-help")).map((n) => n.getAttribute("data-ui"));
  assert.deepEqual(ids(), ["help-create-diagram", "help-create-run"]);
  bar.update(open(), "diagram");
  assert.deepEqual(ids(), ["help-create-diagram", "help-create-run"]);
  bar.update({ ...open(), locked: { diagram: false, check: true } }, "setup");
  assert.deepEqual(ids(), ["help-create-diagram"]);
});
