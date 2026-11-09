import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveInspector } from "../public/js/replay/inspect-model.js";

const events = [
  { t: 0, type: "run_start", task: "Why is the sky blue?" },
  { t: 1, type: "agent_start", agent: "planner", role: "Planner", model: "m1", tools: [], system: "Plan it." },
  { t: 2, type: "round", agent: "planner", round: 1, ms: 40, stop: "end_turn", usage: { input: 5, output: 3 }, newMessages: [{ role: "user", content: "Task" }], content: [{ type: "text", text: "a plan" }] },
  { t: 3, type: "agent_output", agent: "planner", text: "a plan", tokens: { input: 5, output: 3 } },
  { t: 4, type: "handoff", from: "planner", to: "researcher", note: "a plan" },
  { t: 5, type: "agent_start", agent: "researcher", role: "Researcher", model: "m2", tools: ["web_search"], system: "Search." },
  { t: 6, type: "round", agent: "researcher", round: 1, ms: 90, stop: "end_turn", usage: { input: 9, output: 4 }, newMessages: [{ role: "user", content: "a plan" }], content: [{ type: "text", text: "found" }] },
  { t: 7, type: "tool_call", agent: "researcher", tool: "web_search", input: "one" },
  { t: 8, type: "tool_call", agent: "researcher", tool: "web_search", input: "two" },
  { t: 9, type: "tool_result", agent: "researcher", tool: "web_search", output: "result one" },
  { t: 10, type: "tool_result", agent: "researcher", tool: "web_search", output: "result two" },
  { t: 11, type: "agent_output", agent: "researcher", text: "found", tokens: { input: 9, output: 4 } },
  { t: 12, type: "done" },
];

test("agents are listed in order, all waiting before the run reaches them", () => {
  const s = deriveInspector(events, 2);
  assert.deepEqual(s.order, ["planner", "researcher"]);
  assert.equal(s.agents.planner.status, "working");
  assert.equal(s.agents.researcher.status, "waiting");
});

test("agent_start fills label, model, tools and system prompt; the output gives duration and status", () => {
  const s = deriveInspector(events);
  const p = s.agents.planner;
  assert.deepEqual([p.label, p.model, p.system, p.status, p.ms, p.output], ["Planner", "m1", "Plan it.", "done", 2, "a plan"]);
  assert.deepEqual(s.agents.researcher.tools, ["web_search"]);
});

test("a round becomes a model step and a round with accumulated messages", () => {
  const p = deriveInspector(events).agents.planner;
  assert.equal(p.steps[0].kind, "model");
  assert.deepEqual(p.steps[0].title, { key: "insp.modelCall", params: { n: 1 } });
  assert.equal(p.steps[0].ms, 40);
  assert.equal(p.rounds[0].messages.length, 1);
  assert.equal(p.rounds[0].stop, "end_turn");
});

test("two tool calls and two results pair up in order", () => {
  const steps = deriveInspector(events).agents.researcher.steps.filter((s) => s.kind === "tool");
  assert.deepEqual(steps.map((s) => [s.input, s.output]), [["one", "result one"], ["two", "result two"]]);
});

test("a call whose result has not arrived yet has no output", () => {
  const steps = deriveInspector(events, 9).agents.researcher.steps.filter((s) => s.kind === "tool");
  assert.deepEqual(steps.map((s) => s.output), [null, null]);
});

test("a handoff is a step of the sender, carries its note and marks where the receiver got input", () => {
  const s = deriveInspector(events);
  const step = s.agents.planner.steps.at(-1);
  assert.equal(step.kind, "handoff");
  assert.equal(step.output, "a plan");
  assert.equal(s.agents.researcher.from, "planner");
});

test("steps keep the index of the event they came from", () => {
  const steps = deriveInspector(events).agents.researcher.steps;
  assert.deepEqual(steps.map((s) => s.eventIndex), [6, 7, 8]);
});

const old = events.filter((e) => e.type !== "round").map((e) => (e.type === "agent_start" ? { ...e, tools: undefined, model: undefined, system: undefined } : e));

test("a run without round events still yields tool and handoff steps", () => {
  const s = deriveInspector(old);
  assert.equal(s.agents.researcher.steps.filter((x) => x.kind === "tool").length, 2);
  assert.equal(s.agents.planner.steps.at(-1).kind, "handoff");
});

test("a run without round events gets one reconstructed model step and round per started agent", () => {
  const s = deriveInspector(old);
  for (const id of ["planner", "researcher"]) {
    const a = s.agents[id];
    assert.equal(a.steps[0].kind, "model");
    assert.equal(a.rounds.length, 1);
    assert.equal(a.rounds[0].reconstructed, true);
    assert.equal(a.rounds[0].stop, "end_turn");
  }
  assert.equal(s.agents.planner.steps[0].ms, 2);
});

test("a reconstructed round takes its input from the task or the handoff and carries the tool calls and the answer", () => {
  const s = deriveInspector(old);
  assert.deepEqual(s.agents.planner.rounds[0].messages, [{ role: "user", content: "Why is the sky blue?" }]);
  assert.deepEqual(s.agents.researcher.rounds[0].messages, [{ role: "user", content: "a plan" }]);
  const types = s.agents.researcher.rounds[0].response.map((b) => b.type);
  assert.deepEqual(types, ["server_tool_use", "web_search_tool_result", "server_tool_use", "web_search_tool_result", "text"]);
});

test("tool names come from the tool calls when the run did not record them", () => {
  assert.deepEqual(deriveInspector(old).agents.researcher.tools, ["web_search"]);
});

test("an agent that has not started is left alone", () => {
  const s = deriveInspector(old, 3);
  assert.deepEqual(s.agents.researcher.steps, []);
  assert.deepEqual(s.agents.researcher.rounds, []);
});

test("tokens add up and an error marks the working agent", () => {
  assert.deepEqual(deriveInspector(events).tokens, { input: 14, output: 7 });
  const failed = deriveInspector([...events.slice(0, 6), { t: 7, type: "error", message: "boom" }]);
  assert.equal(failed.agents.researcher.status, "error");
  assert.equal(failed.error, "boom");
});
