import { test } from "node:test";
import assert from "node:assert/strict";
import { runRow } from "../public/js/play-shared.js";

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...nodes) { this.children.push(...nodes); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(" "); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }), createElementNS: (ns, tag) => new El(tag) };
const ctx = { doc, t: (k, p) => (p ? `${k}|${JSON.stringify(p)}` : k), lang: "en", settings: null };
const base = { id: "r1", title: "A run", pattern: "debate", provider: "groq" };
const build = (item = {}, pick = {}) => runRow(ctx, { ...base, ...item }, { checked: false, base: false, selected: false, onToggle() {}, onSelect() {}, ...pick });
const ui = (li, name) => li.find((e) => e.attrs["data-ui"] === name);

test("the outcome is the colour of the card: finished green, stopped amber, failed red, none no colour", () => {
  assert.match(build({ outcome: "finished" }).attrs.class, /out-ok/);
  assert.match(build({ outcome: "stopped_limit" }).attrs.class, /out-warn/);
  assert.match(build({ outcome: "waiting_approval" }).attrs.class, /out-warn/);
  assert.match(build({ outcome: "failed" }).attrs.class, /out-fail/);
  assert.doesNotMatch(build({}).attrs.class, /out-/);
});

test("the card has no outcome icon, but says the outcome in words for a screen reader", () => {
  const li = build({ outcome: "failed" });
  assert.equal(ui(li, "run-outcome-chip").length, 0);
  assert.equal(li.find((e) => String(e.attrs.class).includes("outcome-icon")).length, 0);
  const said = ui(li, "run-outcome")[0];
  assert.match(said.attrs.class, /visually-hidden/);
  assert.match(said.text, /result\.status\.failed/);
});

test("the side column in the top right corner holds, from the top, the tick box, the kind, the step and the level, and the title row holds the link", () => {
  const li = build({ kind: "pair", level: 2 }, { step: { n: 3, done: false }, goal: "patterns" });
  const side = li.find((e) => String(e.attrs.class) === "run-side")[0];
  assert.deepEqual(side.children.map((c) => c.attrs["data-ui"]), ["compare-select", "run-kind", "run-step", "run-level"]);
  const top = li.find((e) => String(e.attrs.class) === "run-top")[0];
  assert.equal(top.children[0].tag, "a");
  assert.equal(top.find((e) => e.attrs["data-ui"] === "compare-select").length, 0);
});

test("a step of the path shows its number, and a done step is marked", () => {
  const open = ui(build({}, { step: { n: 3, done: false }, goal: "patterns" }), "run-step")[0];
  assert.equal(open.text.trim(), "3");
  assert.doesNotMatch(open.attrs.class, /done/);
  const done = ui(build({}, { step: { n: 3, done: true }, goal: "patterns" }), "run-step")[0];
  assert.match(done.attrs.class, /done/);
  assert.match(done.text, /3/);
  assert.equal(ui(build(), "run-step").length, 0);
});

test("the level is dots, as many filled as the level, and a run without a level has none", () => {
  const dots = ui(build({ level: 2 }), "run-level")[0];
  assert.match(dots.attrs.class, /lv-dots l2/);
  assert.equal(dots.find((e) => e.attrs.class === "on").length, 2);
  assert.equal(dots.find((e) => e.tag === "i").length, 3);
  assert.match(dots.attrs["aria-label"], /path\.level\.label/);
  assert.equal(ui(build(), "run-level").length, 0);
  assert.equal(ui(build({ level: 9 }), "run-level").length, 0);
});

test("a before and after run and a bad on purpose run say so with an icon whose label and tip hold the words", () => {
  const pair = ui(build({ kind: "pair" }), "run-kind")[0];
  assert.equal(pair.text, "⇄");
  assert.match(pair.attrs["aria-label"], /path\.kind\.pair/);
  assert.match(pair.attrs.title, /path\.kindTip\.pair/);
  const bad = ui(build({ kind: "bad" }), "run-kind")[0];
  assert.equal(bad.text, "⚠");
  assert.match(bad.attrs["aria-label"], /path\.kind\.bad/);
  assert.equal(ui(build(), "run-kind").length, 0);
});
