import { test } from "node:test";
import assert from "node:assert/strict";
import { condensesOf } from "../public/js/replay/condense-model.js";
import { condensePanel } from "../public/js/replay/condense-view.js";

const events = [
  { t: 0, type: "run_start", task: "T", design: { pattern: "sequential", nodes: [], edges: [] } },
  { t: 1, type: "agent_start", agent: "b", system: "s" },
  { t: 2, type: "condense", agent: "b", from: 3420, to: 610, text: "Short.", material: "The long text", usage: { input: 700, output: 20 } },
  { t: 3, type: "condense", agent: "c", from: 100, to: 20, text: "S2" },
  { t: 4, type: "done", outcome: "finished" },
];

test("condensesOf lists the condensings revealed so far; an old recording has none", () => {
  assert.equal(condensesOf(events, 2).length, 0);
  const all = condensesOf(events);
  assert.deepEqual(all.map((c) => [c.agent, c.from, c.to, c.tokens, c.material]), [["b", 3420, 610, 720, "The long text"], ["c", 100, 20, 0, null]]);
  assert.deepEqual(condensesOf(events.filter((e) => e.type !== "condense")), []);
  assert.deepEqual(condensesOf(undefined), []);
});

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.handlers = {}; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  append(...n) { this.children.push(...n); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text ?? "").join(""); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const t = (key, params = {}) => [key, ...Object.values(params)].join(" ");

test("the box shows the sizes and the summary, a button only when the full text was recorded, and the full text when open", () => {
  const items = condensesOf(events);
  let toggled = null;
  const closed = condensePanel({ doc, t, items, label: (id) => id.toUpperCase(), toggle: (i) => (toggled = i) });
  assert.equal(closed.find((e) => e.attrs["data-ui"] === "condense-box").length, 2);
  assert.match(closed.find((e) => e.tag === "h4")[0].text, /B 3420 610 703 720/);
  assert.equal(closed.find((e) => e.attrs["data-ui"] === "condense-toggle").length, 1);
  assert.equal(closed.find((e) => e.attrs["data-ui"] === "condense-full").length, 0);
  closed.find((e) => e.attrs["data-ui"] === "condense-toggle")[0].handlers.click();
  assert.equal(toggled, 0);
  const open = condensePanel({ doc, t, items, label: (id) => id, isOpen: (i) => i === 0 });
  assert.equal(open.find((e) => e.attrs["data-ui"] === "condense-full")[0].text, "The long text");
  assert.equal(condensePanel({ doc, t, items: [], label: (id) => id }), null);
});
