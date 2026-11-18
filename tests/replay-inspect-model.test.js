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

test("steps carry their completion time, model steps the full reply text, handoffs both ends", () => {
  const s = deriveInspector(events);
  const model = s.agents.planner.steps[0];
  assert.deepEqual([model.at, model.stop, model.text, model.messageCount], [2, "end_turn", "a plan", 1]);
  const tools = s.agents.researcher.steps.filter((x) => x.kind === "tool");
  assert.deepEqual(tools.map((x) => x.at), [9, 10]);
  const handoff = s.agents.planner.steps.at(-1);
  assert.deepEqual([handoff.at, handoff.from, handoff.to], [4, "planner", "researcher"]);
});

test("a reconstructed model step completes when the agent answered and has the answer as its text", () => {
  const s = deriveInspector(old);
  assert.equal(s.agents.planner.steps[0].at, 3);
  assert.equal(s.agents.planner.steps[0].text, "a plan");
});

test("in a debate the judge is listed after all the debaters, although it is first handed a turn early", () => {
  const design = { pattern: "debate", rounds: 1, nodes: [{ id: "d1", agent: "debater" }, { id: "j", agent: "judge" }, { id: "d2", agent: "debater" }], edges: [] };
  const debate = [
    { t: 0, type: "run_start", task: "x", pattern: "debate", design },
    { t: 1, type: "agent_start", agent: "d1", role: "Debater", model: "m", tools: [] },
    { t: 2, type: "handoff", from: "d1", to: "j", note: "a" },
    { t: 3, type: "agent_start", agent: "d2", role: "Debater", model: "m", tools: [] },
    { t: 4, type: "handoff", from: "d2", to: "j", note: "b" },
    { t: 5, type: "agent_start", agent: "j", role: "Judge", model: "m", tools: [] },
  ];
  assert.deepEqual(deriveInspector(debate, 6).order, ["d1", "d2", "j"]);
});

test("debateProgress says which round a debate is in, then that the judge speaks", async () => {
  const { debateProgress } = await import("../public/js/replay/inspect-model.js");
  const design = { pattern: "debate", rounds: 2, nodes: [{ id: "a", agent: "debater" }, { id: "b", agent: "debater" }, { id: "j", agent: "judge" }], edges: [] };
  const ev = [{ type: "run_start", design }, ...["a", "b", "a", "b", "j"].map((agent) => ({ type: "agent_start", agent }))];
  assert.deepEqual(debateProgress(ev, 0), { verdict: false, round: 1, rounds: 2 });
  assert.equal(debateProgress(ev, 2).round, 1);
  assert.equal(debateProgress(ev, 4).round, 2);
  assert.equal(debateProgress(ev, 5).round, 2);
  assert.equal(debateProgress(ev, 6).verdict, true);
  assert.equal(debateProgress([{ type: "run_start", design: { pattern: "parallel", nodes: [] } }], 1), null);
});

test("agent names come from the run design from the start and do not change when an agent becomes active", () => {
  const design = { pattern: "debate", rounds: 1, nodes: [{ id: "debater", agent: "debater" }, { id: "debater-2", agent: "debater" }, { id: "judge", agent: "judge" }], edges: [] };
  const ev = [
    { t: 0, type: "run_start", task: "x", design },
    { t: 1, type: "agent_start", agent: "debater", role: "Debater", model: "m", tools: [] },
  ];
  for (const cursor of [1, 2]) {
    const s = deriveInspector(ev, cursor);
    assert.deepEqual(s.order.map((id) => s.agents[id].label), ["Debater 1", "Debater 2", "Judge"].slice(0, s.order.length));
  }
});

test("designLabel gives the name of a free agent that has not started, and numbers agents of the same type", async () => {
  const { designLabel } = await import("../public/js/replay/inspect-model.js");
  const design = { pattern: "supervisor", nodes: [{ id: "supervisor", agent: "supervisor" }, { id: "r1", agent: "researcher" }, { id: "r2", agent: "researcher" }, { id: "free", agent: "free", name: "Finance advisor" }], edges: [] };
  assert.equal(designLabel(design, "free"), "Finance advisor");
  assert.equal(designLabel(design, "r2"), "Researcher 2");
  assert.equal(designLabel(design, "unknown"), "unknown");
});

// ---- evaluator loop ----
import { evaluatorProgress, loopOutcome } from "../public/js/replay/inspect-model.js";

const evalEvents = (rounds, ...rest) => [
  { type: "run_start", t: 0, design: { pattern: "evaluator", rounds, criteria: "", nodes: [{ id: "writer", agent: "writer" }, { id: "evaluator", agent: "evaluator" }], edges: [{ from: "writer", to: "evaluator" }] } },
  ...rest,
];
const start = (agent) => ({ type: "agent_start", agent, t: 1 });

test("evaluatorProgress follows the drafts and the verdicts", () => {
  const events = evalEvents(2, start("writer"), start("evaluator"), start("writer"), start("evaluator"));
  assert.deepEqual(evaluatorProgress(events, 1), { round: 1, rounds: 2, phase: "writing" });
  assert.deepEqual(evaluatorProgress(events, 3), { round: 1, rounds: 2, phase: "judging" });
  assert.deepEqual(evaluatorProgress(events, 4), { round: 2, rounds: 2, phase: "writing" });
  assert.deepEqual(evaluatorProgress(events, 5), { round: 2, rounds: 2, phase: "judging" });
  assert.deepEqual(evaluatorProgress(events, 0), { round: 1, rounds: 2, phase: "writing" });
});

test("evaluatorProgress is null for other patterns", () => {
  assert.equal(evaluatorProgress([{ type: "run_start", t: 0, design: { pattern: "debate", rounds: 2, nodes: [], edges: [] } }], 1), null);
});

test("loopOutcome reads the three endings and is null without a loop_end event", () => {
  for (const [result, judged] of [["accepted", true], ["not_accepted", true], ["stopped", false]]) {
    const events = evalEvents(3, { type: "loop_end", result, round: 2, judged, t: 5 });
    assert.deepEqual(loopOutcome(events), { result, round: 2, judged, rounds: 3 });
  }
  assert.equal(loopOutcome(evalEvents(3, start("writer"))), null);
});

// ---- handoff ----
import { handoffProgress, handoffPath, handoffOutcome } from "../public/js/replay/inspect-model.js";

const hDesign = { pattern: "handoff", start: "a", nodes: [{ id: "a", agent: "planner" }, { id: "b", agent: "writer" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] };
const hEvents = (done = { type: "done", outcome: "finished" }) => [
  { type: "run_start", task: "t", pattern: "handoff", design: hDesign },
  { type: "agent_start", agent: "a" },
  { type: "handoff", from: "a", to: "b", note: "n1" },
  { type: "agent_start", agent: "b" },
  { type: "handoff", from: "b", to: "a", note: "n2" },
  { type: "agent_start", agent: "a" },
  done,
];

test("handoffProgress: before the first event, after the start, after a handoff, and on a return to an earlier agent", () => {
  const events = hEvents();
  assert.deepEqual(handoffProgress(events, 1), { holder: "a", handoffs: 0, path: ["a"] });
  assert.deepEqual(handoffProgress(events, 2), { holder: "a", handoffs: 0, path: ["a"] });
  assert.deepEqual(handoffProgress(events, 3), { holder: "b", handoffs: 1, path: ["a", "b"] });
  assert.deepEqual(handoffProgress(events, 4), { holder: "b", handoffs: 1, path: ["a", "b"] });
  assert.deepEqual(handoffProgress(events, 7), { holder: "a", handoffs: 2, path: ["a", "b", "a"] });
});

test("handoffProgress and handoffPath are null for other patterns; handoffPath of a run without handoff is the start", () => {
  const debate = [{ type: "run_start", design: { pattern: "debate", nodes: [], edges: [], rounds: 1 } }];
  assert.equal(handoffProgress(debate, 1), null);
  assert.equal(handoffPath(debate), null);
  assert.deepEqual(handoffPath(hEvents()), ["a", "b", "a"]);
  assert.deepEqual(handoffPath([{ type: "run_start", design: hDesign }, { type: "agent_start", agent: "a" }]), ["a"]);
});

test("handoffOutcome: finished by the last agent, stopped by a limit, nothing for failed or unfinished runs", () => {
  assert.deepEqual(handoffOutcome(hEvents()), { result: "finished", handoffs: 2, by: "a" });
  assert.deepEqual(handoffOutcome(hEvents({ type: "done", outcome: "stopped_limit", reason: "steps" })), { result: "stopped", handoffs: 2, by: "a", reason: "steps" });
  assert.equal(handoffOutcome(hEvents({ type: "done", outcome: "failed" })), null);
  assert.equal(handoffOutcome(hEvents().slice(0, 4)), null);
});

test("handoffSender reads the sender from a message that carries a note; the first message of the start agent has none", async () => {
  const { handoffSender } = await import("../public/js/replay/inspect-model.js");
  assert.equal(handoffSender("Task: t\n\nHanded over by Planner:\nnote text\n\nYou may hand over to: b (Writer)"), "Planner");
  assert.equal(handoffSender("Task: t\n\nYou may hand over to: b (Writer)"), null);
  assert.equal(handoffSender(5), null);
});

test("handoffProgress: between a handoff and the next agent_start the holder is the agent the handoff went to", () => {
  const events = hEvents().slice(0, 3);
  assert.equal(handoffProgress(events, 3).holder, "b");
});

// ---- router ----
const rDesign = { pattern: "router", nodes: [{ id: "router", agent: "router" }, { id: "w", agent: "writer" }, { id: "r", agent: "researcher" }], edges: [{ from: "router", to: "w" }, { from: "router", to: "r" }] };
const rEvents = (done = { type: "done", outcome: "finished" }) => [
  { type: "run_start", task: "t", pattern: "router", design: rDesign },
  { type: "agent_start", agent: "router" },
  { type: "handoff", from: "router", to: "w", note: "A writing task." },
  { type: "agent_start", agent: "w" },
  done,
];

test("routerChoice: nothing before the choice, the specialist and the reason after it, null for other patterns", async () => {
  const { routerChoice } = await import("../public/js/replay/inspect-model.js");
  assert.equal(routerChoice(rEvents(), 2), null);
  assert.deepEqual(routerChoice(rEvents(), 3), { to: "w", reason: "A writing task." });
  assert.equal(routerChoice(hEvents(), 5), null);
});

test("routerEnd: answered, stopped by a limit, nothing for failed or unfinished runs", async () => {
  const { routerEnd } = await import("../public/js/replay/inspect-model.js");
  assert.deepEqual(routerEnd(rEvents()), { result: "answered", to: "w", reason: "A writing task." });
  assert.deepEqual(routerEnd(rEvents({ type: "done", outcome: "stopped_limit" })), { result: "stopped", to: "w", reason: "A writing task." });
  assert.deepEqual(routerEnd(rEvents({ type: "done", outcome: "stopped_limit" }).filter((e) => e.type !== "handoff")), { result: "stopped", to: null, reason: "" });
  assert.equal(routerEnd(rEvents({ type: "done", outcome: "failed" })), null);
  assert.equal(routerEnd(rEvents().slice(0, 4)), null);
});

// ---- voting ----
const vDesign = { pattern: "voting", nodes: [{ id: "a", agent: "researcher" }, { id: "b", agent: "writer" }, { id: "c", agent: "critic" }, { id: "tally", agent: "tally" }], edges: [{ from: "a", to: "tally" }, { from: "b", to: "tally" }, { from: "c", to: "tally" }] };
const vDecision = (agree) => JSON.stringify({ answer: "Blue", agree, note: "c differs" });
const vEvents = (agree = ["a", "b"], done = { type: "done", outcome: "finished" }) => [
  { type: "run_start", task: "t", pattern: "voting", design: vDesign },
  { type: "agent_start", agent: "a" },
  { type: "handoff", from: "a", to: "tally", note: "Blue" },
  { type: "agent_start", agent: "tally" },
  { type: "agent_output", agent: "tally", text: vDecision(agree) },
  done,
];

test("votingTally: nothing before the decision, the agreeing voters after it, null for other patterns", async () => {
  const { votingTally } = await import("../public/js/replay/inspect-model.js");
  assert.equal(votingTally(vEvents(), 4), null);
  assert.deepEqual(votingTally(vEvents(), 5), { agree: ["a", "b"], votes: 2, total: 3, answer: "Blue", note: "c differs" });
  assert.equal(votingTally(rEvents(), 5), null);
});

test("votingTally takes the last valid decision, so a repaired reply counts", async () => {
  const { votingTally } = await import("../public/js/replay/inspect-model.js");
  const events = vEvents(["a", "b", "c"]);
  events.splice(4, 0, { type: "agent_output", agent: "tally", text: "not json" });
  assert.deepEqual(votingTally(events)?.agree, ["a", "b", "c"]);
});

test("votingEnd: majority, no majority, stopped by a limit, nothing for failed or unfinished runs", async () => {
  const { votingEnd } = await import("../public/js/replay/inspect-model.js");
  assert.deepEqual(votingEnd(vEvents()), { result: "majority", votes: 2, total: 3, note: "c differs" });
  assert.deepEqual(votingEnd(vEvents(["a"])), { result: "none", votes: 1, total: 3, note: "c differs" });
  assert.deepEqual(votingEnd(vEvents(["a", "b"], { type: "done", outcome: "stopped_limit" }).filter((e) => e.type !== "agent_output")), { result: "stopped", votes: 0, total: 3, note: "" });
  assert.equal(votingEnd(vEvents(["a"], { type: "done", outcome: "failed" })), null);
  assert.equal(votingEnd(vEvents().slice(0, 5)), null);
});
