import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSide } from "../public/js/compare-side.js";

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.handlers = {}; this.value = ""; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(name, fn) { this.handlers[name] = fn; }
  append(...n) { this.children.push(...n); }
  replaceChildren(...n) { this.children = [...n]; }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text ?? "").join(""); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const t = (key, params = {}) => [key, ...Object.values(params)].join(" ");
const ui = (root, name) => root.find((e) => e.attrs["data-ui"] === name);
const fakeClock = () => {
  const q = [];
  let id = 0;
  return { setTimeout: (fn) => (q.push({ id: ++id, fn }), id), clearTimeout: (i) => { const k = q.findIndex((x) => x.id === i); if (k >= 0) q.splice(k, 1); }, run: () => q.shift()?.fn(), pending: () => q.length };
};

function rec(id, { ends = 2000, text = id, notebook = false } = {}) {
  const nodes = [{ id: "w", agent: "writer", model: "balanced", search: false }];
  const design = { pattern: "sequential", nodes, edges: [], ...(notebook ? { memory: { notebook: true } } : {}) };
  return {
    id, title: id, task: "T", design, recordedWith: { provider: "anthropic" },
    events: [
      { t: 0, type: "run_start", task: "T", design },
      { t: 100, type: "agent_start", agent: "w", model: "m" },
      { t: ends - 100, type: "agent_output", agent: "w", text, tokens: { input: 100, output: 20 } },
      { t: ends, type: "done", outcome: "finished", finalText: text, usage: { input: 100, output: 20, searches: 0, steps: 1 } },
    ],
  };
}
const make = (runs, clock = fakeClock()) => ({ clock, side: compareSide({ doc, t, runs, clockApi: clock, num: String }) });

test("columns equal the runs, capped at three", () => {
  assert.equal(ui(make([rec("a"), rec("b")]).side.element, "compare-side-col").length, 2);
  const four = make([rec("a"), rec("b"), rec("c"), rec("d")]).side.element;
  assert.equal(ui(four, "compare-side-col").length, 3);
  assert.equal(ui(four, "compare-side-max").length, 1);
});

test("moving the position changes every column", () => {
  const { side } = make([rec("a"), rec("b", { ends: 1000 })]);
  const before = ui(side.element, "compare-side-agent").map((e) => e.text);
  ui(side.element, "compare-side-scrub")[0].value = "500";
  ui(side.element, "compare-side-scrub")[0].handlers.input();
  const after = ui(side.element, "compare-side-agent").map((e) => e.text);
  assert.notDeepEqual(before, after);
  assert.match(after[0], /working/);
});

test("a finished run keeps its last picture while a longer one plays on", () => {
  const { side } = make([rec("a", { ends: 500, text: "short answer" }), rec("b", { ends: 4000 })]);
  const scrub = ui(side.element, "compare-side-scrub")[0];
  scrub.value = "3000";
  scrub.handlers.input();
  const cols = ui(side.element, "compare-side-col");
  assert.match(cols[0].text, /short answer/);
  assert.match(cols[0].text, /done/);
  assert.match(cols[1].text, /working/);
});

test("the by-step switch changes the readout", () => {
  const { side } = make([rec("a")]);
  const time = ui(side.element, "compare-side-readout")[0].text;
  ui(side.element, "compare-side-mode-step")[0].handlers.click();
  assert.notEqual(ui(side.element, "compare-side-readout")[0].text, time);
  assert.match(ui(side.element, "compare-side-readout")[0].text, /compare\.side\.of/);
});

test("notebook runs show the badge, and destroy stops the clock", () => {
  const { side, clock } = make([rec("a", { notebook: true }), rec("b")]);
  assert.match(ui(side.element, "compare-side-col")[0].text, /compare\.side\.notebook/);
  ui(side.element, "compare-side-play")[0].handlers.click();
  assert.equal(clock.pending(), 1);
  side.destroy();
  assert.equal(clock.pending(), 0);
});

test("running totals show no NaN for a run without a done event", () => {
  const r = rec("a");
  r.events = r.events.slice(0, 3);
  const { side } = make([r, rec("b")]);
  const scrub = ui(side.element, "compare-side-scrub")[0];
  scrub.value = "1900";
  scrub.handlers.input();
  assert.doesNotMatch(side.element.text, /NaN|undefined|Infinity/);
});

test("the scrubber can reach the end of a run with an uneven duration", () => {
  const { side } = make([rec("a", { ends: 18437 })]);
  const scrub = ui(side.element, "compare-side-scrub")[0];
  assert.equal(scrub.attrs.step, "1");
  scrub.value = scrub.attrs.max;
  scrub.handlers.input();
  assert.match(ui(side.element, "compare-side-col")[0].text, /done/);
});
