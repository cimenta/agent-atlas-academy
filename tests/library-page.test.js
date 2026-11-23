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
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const ctx = { doc, t: (k) => k, lang: "en", settings: null };
const item = { id: "r1", title: "A run", pattern: "debate", outcome: "finished", provider: "groq", createdAt: 1 };
const build = (over = {}) => {
  const log = [];
  const li = runRow(ctx, item, { checked: false, base: false, selected: false, onToggle: (on) => log.push(["tick", on]), onSelect: (id) => log.push(["select", id]), ...over });
  return { li, log };
};

test("the card has no cog and no menu, and the tick box sits in the tools at the right of the top row", () => {
  const { li } = build();
  assert.equal(li.find((e) => e.attrs["data-ui"] === "run-cog").length, 0);
  const tools = li.find((e) => String(e.attrs.class) === "run-tools")[0];
  assert.equal(tools.find((e) => e.attrs["data-ui"] === "compare-select").length, 1);
});

test("a click anywhere on the card selects the run once, but a click that starts in the tick box does not", () => {
  const { li, log } = build();
  const click = li.listeners.click[0];
  click({ target: { closest: () => null }, preventDefault() {} });
  assert.deepEqual(log, [["select", "r1"]]);
  log.length = 0;
  click({ target: { closest: (sel) => (sel === "input" ? {} : null) }, preventDefault() {} });
  assert.deepEqual(log, []);
});

test("the title is a link to the Library with the run, and clicking it selects without leaving the page", () => {
  const { li, log } = build();
  const link = li.find((e) => e.tag === "a")[0];
  assert.equal(link.attrs.href, "#/play/library/r1");
  let prevented = false;
  link.listeners.click[0]({ target: link, preventDefault() { prevented = true; }, stopPropagation() {} });
  assert.equal(prevented, true);
  assert.deepEqual(log, [["select", "r1"]], "once, not twice through the card and the link");
});

test("ticking calls onToggle with the new state, and the selected card is marked", () => {
  const { li, log } = build({ selected: true });
  const tick = li.find((e) => e.attrs["data-ui"] === "compare-select")[0];
  tick.checked = true;
  tick.listeners.change[0]();
  assert.deepEqual(log, [["tick", true]]);
  assert.equal(li.attrs["aria-current"], "true");
});

test("every icon and tag of a card says what it is when the mouse rests on it", () => {
  const { li } = build({ base: true });
  const tip = (pred) => li.find(pred)[0]?.attrs.title;
  assert.ok(String(tip((e) => e.attrs["data-ui"] === "run-outcome-chip")).startsWith("library.tip.outcome"));
  assert.equal(tip((e) => e.attrs["data-ui"] === "compare-select"), "library.tip.tick");
  assert.equal(tip((e) => e.attrs["data-ui"] === "compare-base"), "library.tip.base");
  assert.equal(tip((e) => e.attrs["data-ui"] === "run-type"), "library.tip.pattern");
  assert.equal(tip((e) => e.attrs["data-ui"] === "run-when"), "library.tip.when");
  assert.equal(tip((e) => String(e.attrs.class) === "provider-chip"), "library.tip.provider");
});
