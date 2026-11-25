import { test } from "node:test";
import assert from "node:assert/strict";
import { runRow, pairFrame } from "../public/js/play-shared.js";
import { readFileSync } from "node:fs";

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

test("a pair is one frame with a header, a question mark that opens what is compared and what each run teaches, and the two cards", () => {
  const first = { ...base, id: "save-tokens-4000", kind: "pair", twin: "save-tokens-1000", teaches: { en: "Long replies." } };
  const second = { ...base, id: "save-tokens-1000", kind: "pair", twin: "save-tokens-4000", teaches: { en: "Short replies." } };
  const frame = pairFrame(ctx, [first, second], (item) => runRow(ctx, item, { checked: false, base: false, selected: false, onToggle() {}, onSelect() {} }));
  assert.equal(frame.attrs["data-pair"], "save-tokens-1000", "the key is the smaller id");
  assert.equal(frame.find((e) => e.attrs["data-ui"] === "run-row").length, 2);
  const tip = ui(frame, "pair-tip")[0];
  assert.notEqual(tip.attrs.hidden, undefined, "it starts hidden");
  assert.match(tip.text, /pair.cmpDefault/, "the test t returns the key, so the missing text falls back");
  assert.match(tip.text, /Long replies./);
  assert.match(tip.text, /Short replies./);
  const help = ui(frame, "pair-help")[0];
  assert.equal(help.attrs["aria-describedby"], tip.attrs.id);
  assert.equal(help.attrs["aria-expanded"], "false");
  help.listeners.mouseenter[0]();
  assert.equal(tip.hidden, false, "hover opens it");
  help.listeners.mouseleave[0]();
  assert.equal(tip.hidden, true);
  help.listeners.click[0]({});
  help.listeners.mouseleave[0]();
  assert.equal(tip.hidden, false, "a click keeps it open");
  help.listeners.click[0]({});
  assert.equal(tip.hidden, true);
});

test("a trio is one frame with three cards, a three-way header and a middle card in the tip", () => {
  const mk = (id, text) => ({ ...base, id, kind: "trio", teaches: { en: text } });
  const members = [mk("a-1", "First."), mk("a-2", "Second."), mk("a-3", "Third.")];
  const frame = pairFrame(ctx, members, (item) => runRow(ctx, item, { checked: false, base: false, selected: false, onToggle() {}, onSelect() {} }));
  assert.equal(frame.attrs["data-pair"], "a-1");
  assert.equal(frame.find((e) => e.attrs["data-ui"] === "run-row").length, 3);
  assert.match(frame.find((e) => e.attrs.class === "pair-head")[0].text, /path.kind.trio/);
  const tip = ui(frame, "pair-tip")[0];
  for (const word of ["pair.top", "pair.middle", "pair.bottom", "First.", "Second.", "Third."]) assert.match(tip.text, new RegExp(word.replace(".", "\.")));
  assert.equal(ui(frame, "run-kind")[0].text, "⇶");
});

test("every pair of the library says what it compares, in English and in Czech", () => {
  const index = JSON.parse(readFileSync(new URL("../public/runs/index.json", import.meta.url), "utf8"));
  const list = Array.isArray(index) ? index : index.runs;
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  const keys = new Set(list.filter((r) => r.kind === "pair" && r.twin).map((r) => [r.id, r.twin].sort()[0]));
  assert.ok(keys.size >= 12);
  for (const r of list.filter((x) => x.kind === "trio")) keys.add([r.id, ...r.with].sort()[0]);
  for (const key of keys) {
    assert.ok(en["pair.cmp." + key] && cs["pair.cmp." + key], key);
    assert.notEqual(en["pair.cmp." + key], cs["pair.cmp." + key], key);
  }
});
