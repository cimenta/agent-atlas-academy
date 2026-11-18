import test from "node:test";
import assert from "node:assert/strict";
import { dynamicNotice } from "../public/js/outcome-view.js";

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.handlers = {}; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  append(...n) { this.children.push(...n); }
  replaceChildren(...n) { this.children = [...n]; }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text ?? "").join(""); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const t = (key, params = {}) => [key, ...Object.values(params)].join(" ");

test("a finished map-reduce or plan says how many parts or steps", () => {
  const map = dynamicNotice({ doc, t, end: { kind: "mapreduce", result: "finished", total: 4, done: 4 } });
  assert.equal(map.attrs["data-dynamic"], "mapreduce-finished");
  assert.match(map.attrs.class, /outcome-ok/);
  assert.match(map.text, /mapreduce\.finished 4 4/);
  const plan = dynamicNotice({ doc, t, end: { kind: "planexec", result: "finished", total: 3, done: 3 } });
  assert.match(plan.text, /planexec\.finished 3 3/);
});

test("a stopped plan says how far it got; a plan stopped before step 1 and a stopped map-reduce have no result", () => {
  const some = dynamicNotice({ doc, t, end: { kind: "planexec", result: "stopped", total: 3, done: 2 } });
  assert.match(some.attrs.class, /outcome-fail/);
  assert.match(some.text, /planexec\.stopped 3 2/);
  assert.match(dynamicNotice({ doc, t, end: { kind: "planexec", result: "stopped", total: 3, done: 0 } }).text, /planexec\.stoppedEmpty/);
  assert.match(dynamicNotice({ doc, t, end: { kind: "mapreduce", result: "stopped", total: 3, done: 1 } }).text, /mapreduce\.stoppedEmpty/);
});

// ---- the list under the diagram ----
import { dynamicPanel } from "../public/js/replay/dynamic-view.js";

test("the panel lists the parts or the steps with their state, and says nothing when there are none", () => {
  const parts = [{ n: 1, id: "worker#1", text: "Chapter 1", status: "done" }, { n: 2, id: "worker#2", text: "Chapter 2", status: "working" }, { n: 3, id: "worker#3", text: "Chapter 3", status: "waiting" }];
  const root = dynamicPanel({ doc, t, parts, plan: [], label: (id) => id });
  assert.equal(root.attrs["data-ui"], "dynamic-parts");
  const items = root.find((e) => e.attrs["data-ui"] === "dynamic-item");
  assert.deepEqual(items.map((e) => e.attrs.class), ["done", "now", "todo"]);
  assert.match(items[1].text, /Chapter 2/);
  assert.match(items[1].text, /dynamic\.status\.working/);
  assert.equal(dynamicPanel({ doc, t, parts: [], plan: [], label: (id) => id }), null);
  const plan = dynamicPanel({ doc, t, parts: [], plan: [{ n: 1, id: "executor#1", text: "Find", status: "done" }], label: (id) => id });
  assert.equal(plan.attrs["data-ui"], "dynamic-plan");
});

test("a click on an item selects the agent that has it", () => {
  let picked = null;
  const root = dynamicPanel({ doc, t, parts: [{ n: 1, id: "worker#1", text: "A", status: "done" }], plan: [], label: (id) => id, select: (id) => (picked = id) });
  const button = root.find((e) => e.attrs["data-ui"] === "dynamic-pick")[0];
  assert.equal(button.attrs["data-agent"], "worker#1");
  button.handlers.click();
  assert.equal(picked, "worker#1");
});
