import { test } from "node:test";
import assert from "node:assert/strict";
import { markResultTab, refreshResultTab } from "../public/js/tab-state.js";
import { showCenterTip } from "../public/js/center-tip.js";

function fakeTab() {
  const classes = new Set();
  const attrs = {};
  return { classes, attrs, setAttribute: (k, v) => (attrs[k] = v), classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) } };
}
const docWith = (tab) => ({ querySelector: (sel) => (sel === '[data-ui="tab-result"]' ? tab : null) });

test("the Result tab turns light green when there is a result and plain again when there is none", () => {
  const tab = fakeTab();
  const doc = docWith(tab);
  markResultTab(doc, true);
  assert.equal(tab.classes.has("has-result"), true);
  markResultTab(doc, false);
  assert.equal(tab.classes.has("has-result"), false);
  assert.doesNotThrow(() => markResultTab({ querySelector: () => null }, true));
});

test("refreshResultTab looks at the visitor's own runs, and an open run forces it on", async () => {
  const tab = fakeTab();
  const ctx = (list) => ({ doc: docWith(tab), runStore: { list: async () => list } });
  await refreshResultTab(ctx([]));
  assert.equal(tab.classes.has("has-result"), false);
  await refreshResultTab(ctx([{ id: "a" }]));
  assert.equal(tab.classes.has("has-result"), true);
  await refreshResultTab(ctx([]), true);
  assert.equal(tab.classes.has("has-result"), true);
  await refreshResultTab({ doc: docWith(fakeTab()), runStore: { list: async () => { throw new Error("x"); } } });
});

function tipDoc() {
  const listeners = {};
  const body = { children: [], append(el) { this.children.push(el); } };
  return {
    listeners,
    body,
    addEventListener: (type, fn) => (listeners[type] = fn),
    removeEventListener: (type) => delete listeners[type],
    createElement: () => {
      const el = { children: [], attrs: {}, handlers: {}, removed: false };
      el.setAttribute = (k, v) => (el.attrs[k] = v);
      el.append = (...c) => el.children.push(...c);
      el.addEventListener = (type, fn) => (el.handlers[type] = fn);
      el.contains = (n) => n === el || el.children.includes(n);
      el.remove = () => (el.removed = true);
      return el;
    },
    createTextNode: (t) => ({ text: t }),
  };
}

test("a press inside the tip keeps it open so its link can be followed, a press outside closes it", () => {
  const doc = tipDoc();
  const link = doc.createElement();
  link.tagName = "A";
  const tip = showCenterTip({ doc, content: link, setTimer: () => 1, clearTimer: () => {} });
  doc.listeners.pointerdown({ target: link });
  assert.equal(tip.element.removed, false);
  tip.element.handlers.click({ target: link });
  assert.equal(tip.element.removed, true);
  const again = showCenterTip({ doc, content: link, setTimer: () => 1, clearTimer: () => {} });
  doc.listeners.pointerdown({ target: {} });
  assert.equal(again.element.removed, true);
});

test("a run opened from the library turns the Result tab green and makes it lead to that run", async () => {
  const tab = fakeTab();
  const ctx = { doc: docWith(tab), runStore: { list: async () => [] } };
  await refreshResultTab(ctx, true, "sequential-simple");
  assert.equal(tab.classes.has("has-result"), true);
  assert.equal(tab.attrs.href, "#/play/result/sequential-simple");
  await refreshResultTab({ ...ctx, doc: docWith(fakeTab()) }, false, "x");
});
