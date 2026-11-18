import { test } from "node:test";
import assert from "node:assert/strict";
import { compareTable } from "../public/js/compare-view.js";
import { createVerdictStore } from "../public/js/compare-verdict.js";

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
const num = (n) => String(n);
const ui = (root, name) => root.find((e) => e.attrs["data-ui"] === name);

const node = (id, agent, extra = {}) => ({ id, agent, model: "balanced", search: false, ...extra });
function rec(id, { task = "Compare", nodes, memory, ms = 1200, output = 50, withDone = true } = {}) {
  const ns = nodes ?? [node("researcher", "researcher"), node("writer", "writer")];
  const design = { pattern: "sequential", nodes: ns, edges: [{ from: ns[0].id, to: ns[1].id }], ...(memory ? { memory } : {}) };
  const events = [
    { t: 0, type: "run_start", task, design },
    { t: 500, type: "round", agent: ns[0].id, round: 1, usage: { input: 100, output }, newMessages: [], content: [] },
    { t: 600, type: "agent_output", agent: ns[0].id, text: "x", tokens: { input: 100, output } },
    ...(withDone ? [{ t: ms, type: "done", outcome: "finished", finalText: `Answer of ${id}`, usage: { input: 100, output, searches: 0, steps: 1 } }] : []),
  ];
  return { id, title: id, task, pattern: "sequential", language: "en", limits: { maxSteps: 20, maxTokens: 40000, maxSearches: 3 }, design, events, recordedWith: { provider: "anthropic" } };
}
const storage = () => { const d = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => void (d[k] = v), removeItem: (k) => void delete d[k] }; };
const draw = (runs, store = createVerdictStore(storage())) => compareTable({ doc, t, runs, num, store });

test("the table lists only differing rows, and says so when there are none", () => {
  const b = rec("b", { nodes: [node("researcher", "researcher"), node("writer", "writer", { model: "strong" })] });
  const root = draw([rec("a"), b]);
  const rows = ui(root, "compare-change-row");
  assert.equal(rows.length, 1);
  assert.match(rows[0].text, /compare\.k\.model/);
  assert.equal(ui(draw([rec("a"), rec("a2")]), "compare-no-changes").length, 1);
});

test("deltas show a direction and no NaN for a run without done", () => {
  const root = draw([rec("a"), rec("b", { ms: 2400, output: 100 }), rec("c", { withDone: false })]);
  const text = ui(root, "compare-metrics")[0].text;
  assert.doesNotMatch(text, /NaN|Infinity|undefined/);
  assert.match(text, /▲/);
  const cost = ui(root, "compare-metric-ms")[0];
  assert.match(cost.text, /▲ 100/);
});

test("the tasks-differ warning shows and hides the verdict", () => {
  const same = draw([rec("a"), rec("b")]);
  assert.equal(ui(same, "compare-tasks-differ").length, 0);
  assert.equal(ui(same, "compare-verdict").length, 1);
  const diff = draw([rec("a"), rec("b", { task: "Other" })]);
  assert.equal(ui(diff, "compare-tasks-differ").length, 1);
  assert.equal(ui(diff, "compare-verdict").length, 0);
});

test("choosing a run stores the verdict, and drawing again shows it", () => {
  const s = storage();
  const store = createVerdictStore(s);
  const runs = [rec("a"), rec("b")];
  const first = draw(runs, store);
  const chips = ui(first, "compare-pick");
  assert.equal(chips.length, 3);
  chips[1].handlers.click();
  assert.deepEqual(store.get(["a", "b"]), { pick: "b", note: "" });
  const again = draw(runs, store);
  assert.equal(ui(again, "compare-pick")[1].attrs["aria-pressed"], "true");
  assert.equal(ui(again, "compare-pick")[0].attrs["aria-pressed"], "false");
  ui(again, "compare-pick")[2].handlers.click();
  assert.equal(store.get(["a", "b"]).pick, "none");
});

test("the summary names the base, the change in cost and time, and what changed", () => {
  const b = rec("b", { ms: 2400, output: 100, nodes: [node("researcher", "researcher"), node("writer", "writer", { model: "strong" })] });
  const sum = ui(draw([rec("a"), b]), "compare-summary")[0].text;
  assert.match(sum, /compare\.sum /);
  assert.match(sum, /compare\.sumChanged/);
});

test("results show the final text of each run, and a note when one is missing", () => {
  const root = draw([rec("a"), rec("b", { withDone: false })]);
  const answers = ui(root, "compare-answer");
  assert.equal(answers.length, 2);
  assert.match(answers[0].text, /Answer of a/);
});

test("limit rows name which limit differs", () => {
  const a = rec("a");
  const b = rec("b");
  b.limits = { maxSteps: 30, maxTokens: 50000, maxSearches: 3 };
  const rows = ui(draw([a, b]), "compare-change-row").map((r) => r.text);
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].split(" ")[0], rows[1].split(" ")[0]);
  assert.match(rows.join("|"), /compare\.k\.limit\.maxSteps/);
  assert.match(rows.join("|"), /compare\.k\.limit\.maxTokens/);
});

test("counts show the plain difference, times and costs are formatted, percentages are whole", () => {
  const base = rec("a", { ms: 1000 });
  const run = rec("b", { ms: 1333, output: 70 });
  const root = draw([base, run]);
  assert.match(ui(root, "compare-metric-ms")[0].text, /▲ 33 %/);
  const free = rec("f");
  free.events[1].usage = { input: 0, output: 0 };
  const zero = ui(draw([{ ...free, events: [{ t: 0, type: "run_start" }] }, rec("p")]), "compare-metric-ms")[0].text;
  assert.match(zero, /▲ \d+(\.\d)? s/);
  assert.doesNotMatch(zero, /\d{4,}(?! s)/);
});

test("agents that exist in only some runs become one Agents row with a not-in mark", () => {
  const other = rec("b", { nodes: [node("debater", "debater"), node("judge", "judge")] });
  const root = draw([rec("a"), other]);
  const agents = ui(root, "compare-change-row").filter((r) => /compare\.k\.agents/.test(r.text));
  assert.equal(agents.length, 1);
  assert.match(agents[0].text, /compare\.notIn A/);
});

test("a note is kept before any run is picked", () => {
  const store = createVerdictStore(storage());
  const runs = [rec("a"), rec("b")];
  const root = draw(runs, store);
  const field = ui(root, "compare-note")[0];
  field.value = "thin answer";
  field.handlers.input();
  assert.deepEqual(store.get(["a", "b"]), { pick: "", note: "thin answer" });
  assert.equal(ui(draw(runs, store), "compare-note")[0].value, "thin answer");
});

test("the verdict says so when the browser cannot keep it", () => {
  const broken = { getItem: () => null, setItem() { throw new Error("full"); }, removeItem() {} };
  const root = draw([rec("a"), rec("b")], createVerdictStore(broken));
  ui(root, "compare-pick")[0].handlers.click();
  assert.match(ui(root, "compare-verdict-status")[0].text, /compare\.verdictFailed/);
});
