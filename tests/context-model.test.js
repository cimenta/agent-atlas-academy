import { test } from "node:test";
import assert from "node:assert/strict";
import { contextOf, runMetrics } from "../public/js/replay/context-model.js";
import { buildStatistics } from "../public/js/play-model.js";

const TASK = "Why is the sky blue?";
const FIRST = `Task: ${TASK}\n\nAnswers of the others:\nBlue.`;
const events = [
  { t: 0, type: "run_start", task: TASK },
  { t: 1, type: "agent_start", agent: "writer", role: "Writer", model: "m", tools: [], system: "Role: writer\nWrite." },
  { t: 2, type: "round", agent: "writer", round: 1, ms: 5, stop: "tool_use", usage: { input: 100, output: 10 }, newMessages: [{ role: "user", content: FIRST }], content: [{ type: "text", text: "Let me check." }] },
  { t: 3, type: "round", agent: "writer", round: 2, ms: 5, stop: "end_turn", usage: { input: 160, output: 20 }, newMessages: [{ role: "assistant", content: [{ type: "text", text: "Let me check." }] }, { role: "user", content: [{ type: "text", text: "Go on." }] }], content: [{ type: "text", text: "Done." }] },
  { t: 4, type: "agent_output", agent: "writer", text: "Done.", tokens: { input: 260, output: 30 } },
  { t: 5, type: "done", outcome: "finished", usage: { input: 260, output: 30, searches: 0 }, finalText: "Done." },
];

test("contextOf gives one row per round with the provider input tokens", () => {
  const rows = contextOf(events, "writer");
  assert.deepEqual(rows.map((r) => [r.round, r.input]), [[1, 100], [2, 160]]);
});

test("the first message is split into task and others, the system text is counted", () => {
  const [first] = contextOf(events, "writer");
  assert.equal(first.parts.system, "Role: writer\nWrite.".length);
  assert.equal(first.parts.task, `Task: ${TASK}`.length);
  assert.equal(first.parts.others, FIRST.length - `Task: ${TASK}`.length);
  assert.equal(first.parts.notebook, 0);
  assert.equal(first.parts.own, 0);
});

test("own grows by the assistant content of earlier rounds, later user messages count as others", () => {
  const [, second] = contextOf(events, "writer");
  assert.equal(second.parts.own, "Let me check.".length);
  assert.equal(second.parts.others, FIRST.length - `Task: ${TASK}`.length + "Go on.".length);
});

test("a notebook block at the end of the first message counts as notebook", () => {
  const book = "\n\nNotebook:\nA has 16 GB.";
  const withBook = events.map((e) => (e.type === "run_start" ? { ...e, design: { memory: { notebook: true } } } : e.round === 1 ? { ...e, newMessages: [{ role: "user", content: FIRST + book }] } : e));
  const [first] = contextOf(withBook, "writer");
  assert.equal(first.parts.notebook, book.length);
  assert.equal(first.parts.others, FIRST.length - `Task: ${TASK}`.length);
});

test("a cursor shows only the rounds revealed so far", () => {
  assert.equal(contextOf(events, "writer", 3).length, 1);
  assert.equal(contextOf(events, "writer", 0).length, 0);
});

test("an unknown agent, a run with no rounds and odd message shapes give no error", () => {
  assert.deepEqual(contextOf(events, "nobody"), []);
  const old = events.filter((e) => e.type !== "round");
  assert.deepEqual(contextOf(old, "writer"), []);
  const odd = events.map((e) => (e.round === 1 ? { ...e, newMessages: [{ role: "user" }, null, { role: "user", content: 5 }] } : e));
  assert.equal(contextOf(odd, "writer").length, 2);
});

test("runMetrics largest is the highest input; notes and saved are 0 for a run without memory", () => {
  const m = runMetrics({ events });
  assert.equal(m.largest, 160);
  assert.equal(m.notes, 0);
  assert.equal(m.saved, 0);
  assert.equal(m.outcome, "finished");
});

test("runMetrics counts notes and the characters saved by condensing", () => {
  const more = [...events, { t: 6, type: "note", agent: "writer", text: "x", n: 1 }, { t: 7, type: "note", agent: "writer", text: "y", n: 2 }, { t: 8, type: "condense", agent: "writer", from: 3000, to: 500, text: "s" }];
  const m = runMetrics({ events: more });
  assert.equal(m.notes, 2);
  assert.equal(m.saved, 2500);
});

test("runMetrics matches the totals of buildStatistics for the same run", () => {
  const run = { events };
  const stats = buildStatistics(run);
  const m = runMetrics(run);
  assert.equal(m.input, stats.usage.input);
  assert.equal(m.output, stats.usage.output);
  assert.equal(m.steps, stats.calls);
  assert.equal(m.cost, stats.cost);
});

test("contextPerCall lists the input tokens of every round in run order with the agent label", async () => {
  const { contextPerCall } = await import("../public/js/replay/context-model.js");
  assert.deepEqual(contextPerCall(events), [{ agent: "writer", label: "Writer", round: 1, input: 100 }, { agent: "writer", label: "Writer", round: 2, input: 160 }]);
  assert.deepEqual(contextPerCall(events.filter((e) => e.type !== "round")), []);
});

// ---- found in the review ----
test("web search blocks in the history count as the agent's own messages", () => {
  const search = [{ type: "server_tool_use", name: "web_search", input: { query: "sky" } }, { type: "web_search_tool_result", content: [{ type: "web_search_result", title: "T", url: "u", encrypted_content: "x".repeat(500) }] }];
  const withSearch = events.map((e) => (e.round === 2 ? { ...e, newMessages: [{ role: "assistant", content: search }, { role: "user", content: "Go on." }] } : e));
  const [, second] = contextOf(withSearch, "writer");
  assert.ok(second.parts.own > 500);
});

test("the notebook split applies only when the run has the notebook on", () => {
  const book = "\n\nNotebook:\nA has 16 GB.";
  const text = events.map((e) => (e.round === 1 ? { ...e, newMessages: [{ role: "user", content: FIRST + book }] } : e));
  const plain = contextOf(text, "writer")[0];
  assert.equal(plain.parts.notebook, 0);
  assert.equal(plain.parts.others, FIRST.length - `Task: ${TASK}`.length + book.length);
});
