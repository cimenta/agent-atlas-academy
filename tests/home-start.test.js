import { test } from "node:test";
import assert from "node:assert/strict";
import { startCard } from "../public/js/pages.js";

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
const items = [
  { id: "a", title: "Alpha", level: 1, paths: { patterns: 1 } },
  { id: "b", title: "Beta", level: 1, paths: { patterns: 2 } },
  { id: "x", title: "Other", level: 1, paths: { save: 1 } },
];
const ui = (root, name) => root.find((e) => e.attrs["data-ui"] === name);
const card = (over = {}) => startCard({ doc, t, items, done: new Set(), onStart() {}, ...over });

test("a library without runs on the path of patterns has no card", () => {
  assert.equal(card({ items: [{ id: "x", title: "X", level: 1, paths: { save: 1 } }] }), null);
  assert.equal(card({ items: [] }), null);
});

test("nothing done shows the empty text and the Start button", () => {
  const root = card();
  assert.match(root.attrs.class, /home-start/);
  assert.match(root.text, /home\.start\.empty/);
  assert.match(ui(root, "start-go")[0].text, /home\.start\.button/);
});

test("one done step shows Continue and the title of the next step", () => {
  const root = card({ done: new Set(["patterns:a"]) });
  assert.match(root.text, /Beta/);
  assert.match(ui(root, "start-go")[0].text, /home\.start\.continue/);
});

test("steps done for other goals do not count", () => {
  const root = card({ done: new Set(["save:x"]) });
  assert.match(root.text, /home\.start\.empty/);
});

test("all done shows the done text, and the button still opens the path", () => {
  const root = card({ done: new Set(["patterns:a", "patterns:b"]) });
  assert.match(root.text, /home\.start\.done/);
  assert.equal(ui(root, "start-go").length, 1);
});

test("the button and the link call onStart", () => {
  let calls = 0;
  const root = card({ onStart: () => { calls += 1; } });
  ui(root, "start-go")[0].listeners.click[0]({ preventDefault() {} });
  ui(root, "start-more")[0].listeners.click[0]({ preventDefault() {} });
  assert.equal(calls, 2);
});
