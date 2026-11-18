import { test } from "node:test";
import assert from "node:assert/strict";
import { shares, contextView, contextChart } from "../public/js/replay/context-view.js";

class El {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  find(pred, out = []) {
    for (const c of this.children) if (c instanceof El) {
      if (pred(c)) out.push(c);
      c.find(pred, out);
    }
    return out;
  }
  get text() {
    return this.children.map((c) => (c instanceof El ? c.text : c.text)).join("");
  }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const t = (key) => key;

test("shares leave out empty parts and add up to 100", () => {
  const s = shares({ system: 18, task: 6, others: 56, notebook: 0, own: 20 });
  assert.deepEqual(s.map((x) => x.key), ["system", "task", "others", "own"]);
  assert.equal(s.reduce((n, x) => n + x.pct, 0), 100);
  assert.deepEqual(shares({ system: 0, task: 0, others: 0, notebook: 0, own: 0 }), []);
  const many = shares({ system: 1, task: 1, others: 1, notebook: 1, own: 1000 });
  assert.equal(many.reduce((n, x) => n + x.pct, 0), 100);
});

test("the view draws a row per call with the exact input tokens and the bar classes", () => {
  const rows = [{ round: 1, input: 1940, parts: { system: 20, task: 10, others: 70, notebook: 0, own: 0 } }, { round: 2, input: 2480, parts: { system: 10, task: 5, others: 60, notebook: 5, own: 20 } }];
  const view = contextView({ doc, t, rows, num: (n) => String(n) });
  const trs = view.find((e) => e.attrs["data-ui"] === "context-row");
  assert.equal(trs.length, 2);
  assert.match(trs[0].text, /1940/);
  assert.match(trs[1].text, /2480/);
  assert.ok(trs[1].find((e) => e.tag === "i" && /\bs4\b/.test(e.attrs.class)).length === 1);
  assert.equal(view.find((e) => e.attrs["data-ui"] === "context-note").length, 1);
  const noBook = contextView({ doc, t, rows: [rows[0]] });
  assert.equal(noBook.find((e) => e.attrs["data-ui"] === "context-legend")[0].find((e) => e.tag === "span").length, 3);
});

test("with no rows the view shows the hint instead of a table", () => {
  const view = contextView({ doc, t, rows: [] });
  assert.equal(view.attrs["data-ui"], "context-none");
  assert.equal(view.text, "insp.context.none");
});

test("the chart has a bar per call, the highest one full height, and says nothing without calls", async () => {
  const { contextChart } = await import("../public/js/replay/context-view.js");
  const chart = contextChart({ doc, t, points: [{ agent: "a", label: "A", round: 1, input: 100 }, { agent: "b", label: "B", round: 1, input: 400 }] });
  const bars = chart.find((e) => e.tag === "i");
  assert.equal(bars.length, 2);
  assert.match(bars[1].attrs.class, /\bh100\b/);
  assert.match(bars[0].attrs.class, /\bh25\b/);
  assert.equal(contextChart({ doc, t, points: [] }), null);
});

test("shares keep the big part at its real size and add up to 100", () => {
  const s = shares({ system: 300, task: 30, others: 30, notebook: 0, own: 3000 });
  assert.equal(s.find((x) => x.key === "own").pct, 89);
  assert.equal(s.reduce((n, x) => n + x.pct, 0), 100);
});

test("the chart label names the values for a screen reader and an empty bar has no image role", () => {
  const chart = contextChart({ doc, t, points: [{ agent: "a", label: "A", round: 1, input: 100 }, { agent: "b", label: "B", round: 1, input: 400 }] });
  assert.match(chart.find((e) => e.attrs.role === "img")[0].attrs["aria-label"], /A.*100.*B.*400/);
  const view = contextView({ doc, t, rows: [{ round: 1, input: 5, parts: { system: 0, task: 0, others: 0, notebook: 0, own: 0 } }] });
  assert.equal(view.find((e) => e.attrs.role === "img").length, 0);
});

test("the view has the agent heading with the number of calls", () => {
  const view = contextView({ doc, t, label: "Writer", rows: [{ round: 1, input: 5, parts: { system: 1, task: 0, others: 0, notebook: 0, own: 0 } }] });
  assert.match(view.find((e) => e.attrs["data-ui"] === "context-heading")[0].text, /Writer/);
});
