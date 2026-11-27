import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveInspector } from "../public/js/replay/inspect-model.js";
import { runSteps, originOf, involved, receivedOf, passedOf } from "../public/js/replay/step-model.js";

const TASK = "Compare two cities.";
const events = [
  { t: 0, type: "run_start", task: TASK },
  { t: 1, type: "agent_start", agent: "a", role: "A", model: "m", tools: [], system: "Role: a." },
  { t: 2, type: "round", agent: "a", round: 1, ms: 5, stop: "end_turn", usage: { input: 50, output: 10 }, newMessages: [{ role: "user", content: `Task: ${TASK}` }], content: [{ type: "text", text: "Facts." }] },
  { t: 3, type: "agent_output", agent: "a", text: "Facts.", tokens: { input: 50, output: 10 } },
  { t: 3, type: "handoff", from: "a", to: "b", note: "Facts." },
  { t: 4, type: "agent_start", agent: "b", role: "B", model: "m", tools: [], system: "Role: b." },
  { t: 5, type: "round", agent: "b", round: 1, ms: 5, stop: "end_turn", usage: { input: 80, output: 20 }, newMessages: [{ role: "user", content: `Task: ${TASK}\n\nFacts.` }], content: [{ type: "text", text: "Answer." }] },
  { t: 6, type: "agent_output", agent: "b", text: "Answer.", tokens: { input: 80, output: 20 } },
  { t: 7, type: "done", outcome: "finished" },
];

test("runSteps puts the steps of all agents in the order of the events", () => {
  const state = deriveInspector(events);
  const items = runSteps(state, "sequential");
  assert.deepEqual(items.map((i) => [i.agent, i.step.kind]), [["a", "model"], ["a", "handoff"], ["b", "model"]]);
});

test("a handoff on a fixed path is a rule, a model call is the model", () => {
  const items = runSteps(deriveInspector(events), "sequential");
  assert.deepEqual(items.map((i) => i.origin), ["model", "rule", "model"]);
  assert.equal(originOf({ kind: "handoff" }, "handoff"), "model");
  assert.equal(originOf({ kind: "handoff", created: true }, "sequential"), "model");
  assert.equal(originOf({ kind: "check" }, "sequential"), "harness");
});

test("a handoff involves both agents, any other step one", () => {
  const items = runSteps(deriveInspector(events), "sequential");
  assert.deepEqual(involved(items[1]), ["a", "b"]);
  assert.deepEqual(involved(items[0]), ["a"]);
});

test("receivedOf lists the parts of the call: task, then what the others passed on", () => {
  const state = deriveInspector(events);
  const items = runSteps(state, "sequential");
  assert.deepEqual(receivedOf(events, state, items[0], events.length).map((p) => p.part), ["system", "task"]);
  assert.deepEqual(receivedOf(events, state, items[2], events.length).map((p) => p.part), ["system", "task", "others"]);
});

test("passedOf: the last model call of an agent goes to the agent it hands over to, the last agent gives the result", () => {
  const state = deriveInspector(events);
  const items = runSteps(state, "sequential");
  assert.deepEqual(passedOf(state, items[0]), { kind: "agents", agents: ["b"] });
  assert.deepEqual(passedOf(state, items[1]), { kind: "agents", agents: ["b"] });
  assert.deepEqual(passedOf(state, items[2]), { kind: "result", agents: [] });
});
