import { test } from "node:test";
import assert from "node:assert/strict";
import { notebookOf } from "../public/js/replay/notebook-model.js";
import { notebookPanel } from "../public/js/replay/notebook-view.js";

const design = { pattern: "sequential", memory: { notebook: true }, nodes: [{ id: "a", agent: "researcher", notebook: "write" }, { id: "b", agent: "critic", notebook: "both" }], edges: [{ from: "a", to: "b" }] };
const events = [
  { t: 0, type: "run_start", task: "T", design },
  { t: 1, type: "agent_start", agent: "a", system: "s" },
  { t: 2, type: "round", agent: "a", round: 1, usage: { input: 5 }, newMessages: [{ role: "user", content: "Task: T" }], content: [{ type: "text", text: "x" }] },
  { t: 3, type: "note", agent: "a", text: "A has 16 GB.", n: 1 },
  { t: 4, type: "note", agent: "a", text: "B has 8 GB.", n: 2 },
  { t: 5, type: "agent_output", agent: "a", text: "x" },
  { t: 6, type: "agent_start", agent: "b", system: "s" },
  { t: 7, type: "round", agent: "b", round: 1, usage: { input: 9 }, newMessages: [{ role: "user", content: "Task: T\n\nThe previous agent (a) wrote:\nx\n\nNotebook:\n- a: A has 16 GB.\n- a: B has 8 GB." }], content: [{ type: "text", text: "y" }] },
  { t: 8, type: "note", agent: "b", text: "Check the price.", n: 3 },
  { t: 9, type: "done", outcome: "finished" },
];

test("notebookOf lists the notes revealed so far and counts what each agent wrote and read", () => {
  const all = notebookOf(events);
  assert.equal(all.on, true);
  assert.deepEqual(all.notes.map((n) => [n.n, n.agent]), [[1, "a"], [2, "a"], [3, "b"]]);
  assert.deepEqual(all.perAgent.get("a"), { wrote: 2, read: 0 });
  assert.deepEqual(all.perAgent.get("b"), { wrote: 1, read: 2 });
  const early = notebookOf(events, 4);
  assert.deepEqual(early.notes.map((n) => n.n), [1]);
});

test("notebookOf says off for a run without the notebook and for old recordings", () => {
  assert.equal(notebookOf([{ t: 0, type: "run_start", design: { pattern: "sequential", nodes: [], edges: [] } }]).on, false);
  assert.equal(notebookOf([]).on, false);
  assert.deepEqual(notebookOf([{ t: 0, type: "run_start" }]).notes, []);
});

// ---- the panel ----
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  append(...n) { this.children.push(...n); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text ?? "").join(""); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const t = (key, params = {}) => [key, ...Object.values(params)].join(" ");

test("the panel shows every note with its author, and nothing when there are no notes", () => {
  const panel = notebookPanel({ doc, t, notes: notebookOf(events).notes, label: (id) => id.toUpperCase() });
  const items = panel.find((e) => e.attrs["data-ui"] === "notebook-note");
  assert.equal(items.length, 3);
  assert.match(items[2].text, /B/);
  assert.match(items[2].text, /Check the price\./);
  assert.match(panel.find((e) => e.attrs["data-ui"] === "notebook-heading")[0].text, /3/);
  assert.equal(notebookPanel({ doc, t, notes: [], label: (id) => id }), null);
});
