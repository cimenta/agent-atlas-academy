import { test } from "node:test";
import assert from "node:assert/strict";
import { drawPath, drawFilterBar } from "../public/js/library-path-view.js";

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...nodes) { this.children.push(...nodes); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(" "); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const t = (k, p) => (p ? `${k}|${Object.values(p).join(",")}` : k);
const ui = (root, name) => root.find((e) => e.attrs["data-ui"] === name);

const items = [
  { id: "a", title: "Alpha", pattern: "sequential", level: 1, paths: { patterns: 1 }, tags: ["basics"] },
  { id: "b", title: "Beta", pattern: "parallel", level: 1, paths: { patterns: 2 }, tags: ["basics", "cost"], kind: "pair" },
  { id: "c", title: "Gamma", pattern: "debate", level: 2, paths: { patterns: 3 }, tags: ["cost"] },
  { id: "d", title: "Delta", pattern: "router", level: 2, paths: { patterns: 4 }, tags: [] },
];
const base = (over = {}) => ({ doc, t, items, goal: "patterns", tags: [], done: new Set(), tagLabel: (x) => x, teachesOf: (i) => `teaches ${i.id}`, filterBar: new El("div"), onGoal() {}, onToggleDone() {}, onOpen() {}, ...over });

test("the steps are in sections by level, the empty level is left out, and every step shows its title", () => {
  const root = drawPath(base());
  const heads = ui(root, "path-level");
  assert.equal(heads.length, 2);
  assert.match(heads[0].text, /path\.level\.1/);
  assert.match(heads[1].text, /path\.level\.2/);
  assert.equal(ui(root, "path-step").length, 4);
  assert.match(ui(root, "path-step")[0].text, /Alpha/);
});

test("tags keep only the steps that carry them, and a goal left empty says so", () => {
  const some = drawPath(base({ tags: ["cost"] }));
  assert.deepEqual(ui(some, "path-step").map((s) => s.attrs["data-run"]), ["b", "c"]);
  const none = drawPath(base({ tags: ["nothing"] }));
  assert.equal(ui(none, "path-step").length, 0);
  assert.equal(ui(none, "path-empty").length, 1);
});

test("the Continue box is there only when something is done and a step is left", () => {
  assert.equal(ui(drawPath(base()), "path-next").length, 0);
  const some = drawPath(base({ done: new Set(["patterns:a"]) }));
  assert.equal(ui(some, "path-next").length, 1);
  assert.match(ui(some, "path-next")[0].text, /Beta/);
  const all = drawPath(base({ done: new Set(["patterns:a", "patterns:b", "patterns:c", "patterns:d"]) }));
  assert.equal(ui(all, "path-next").length, 0);
  assert.equal(ui(all, "path-all-done").length, 1);
});

test("a done step has a green Open button, and Open comes before Done in the right column", () => {
  const root = drawPath(base({ done: new Set(["patterns:a"]) }));
  const [first, second] = ui(root, "path-step");
  assert.match(first.attrs.class, /done/);
  assert.doesNotMatch(second.attrs.class, /done/);
  const right = first.find((e) => String(e.attrs.class) === "pright")[0];
  const buttons = right.find((e) => e.tag === "button");
  assert.equal(buttons[0].attrs["data-ui"], "step-open");
  assert.equal(buttons[1].attrs["data-ui"], "step-done");
  assert.match(buttons[1].text, /path\.undo/);
  assert.match(second.find((e) => e.attrs["data-ui"] === "step-done")[0].text, /path\.done/);
});

test("in the row of the step the level dots come before the step number and then Open", () => {
  const row = ui(drawPath(base()), "path-step")[0].find((e) => String(e.attrs.class) === "prow")[0];
  const kinds = row.children.map((c) => c.attrs["data-ui"]);
  assert.deepEqual(kinds, ["run-level", "run-step", "step-open"]);
});

test("the buttons call back with the goal and the run", () => {
  const log = [];
  const root = drawPath(base({ onToggleDone: (...a) => log.push(["done", ...a]), onOpen: (id) => log.push(["open", id]), onGoal: (g) => log.push(["goal", g]) }));
  ui(root, "step-done")[0].listeners.click[0]();
  ui(root, "step-open")[1].listeners.click[0]();
  ui(root, "path-goal")[1].listeners.click[0]();
  assert.deepEqual(log, [["done", "patterns", "a", true], ["open", "b"], ["goal", "save"]]);
});

test("the four goals are buttons with the chosen one pressed and a progress bar", () => {
  const goals = ui(drawPath(base({ done: new Set(["patterns:a"]) })), "path-goal");
  assert.equal(goals.length, 4);
  assert.equal(goals[0].attrs["aria-pressed"], "true");
  assert.equal(goals[1].attrs["aria-pressed"], "false");
  assert.match(goals[0].find((e) => e.tag === "i")[0].attrs.style, /width:25%/);
});

test("a goal without runs says so", () => {
  const root = drawPath(base({ goal: "wrong" }));
  assert.equal(ui(root, "path-step").length, 0);
  assert.equal(ui(root, "path-empty").length, 1);
});

test("the filter bar shows the chosen tags, removes one, clears all, and switches the list to the goal", () => {
  const log = [];
  const bar = drawFilterBar({ doc, t, tags: ["cost", "basics"], goal: "patterns", onlyGoal: true, tagLabel: (x) => x.toUpperCase(), onRemove: (x) => log.push(["remove", x]), onClear: () => log.push(["clear"]), onOnlyGoal: (on) => log.push(["only", on]) });
  const chips = ui(bar, "tag-chip");
  assert.equal(chips.length, 2);
  assert.match(chips[0].text, /COST/);
  chips[0].listeners.click[0]();
  ui(bar, "tags-clear")[0].listeners.click[0]();
  const box = ui(bar, "only-goal")[0];
  assert.equal(box.attrs.checked, "");
  box.checked = false;
  box.listeners.change[0]({ target: box });
  assert.deepEqual(log, [["remove", "cost"], ["clear"], ["only", false]]);
  const empty = drawFilterBar({ doc, t, tags: [], goal: "patterns", onlyGoal: false, tagLabel: (x) => x, onRemove() {}, onClear() {}, onOnlyGoal() {} });
  assert.equal(ui(empty, "tag-chip").length, 0);
  assert.equal(ui(empty, "tags-clear").length, 0);
  assert.match(empty.text, /path\.filterNone/);
});
