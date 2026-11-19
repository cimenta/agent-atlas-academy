import { test } from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { createSkipper } from "../public/js/create/create-model.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
function scripted(replies) {
  const call = async () => {
    const next = replies.shift();
    if (next === undefined) throw new Error("script ran out");
    return text(next);
  };
  return { call };
}
async function run(d, call) {
  const events = [];
  const result = await runDesign({ design: d, task: "Task", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  return { result, events };
}

test("a carried-on run does not record a creation or a refusal twice", () => {
  const base = [
    { type: "agent_created", by: "boss", agent: "made-1" },
    { type: "agent_refused", by: "boss", reason: "cap" },
  ];
  const skip = createSkipper(base);
  assert.equal(skip({ type: "agent_created", by: "boss", agent: "made-1" }), true);
  assert.equal(skip({ type: "agent_refused", by: "boss", reason: "cap" }), true);
  assert.equal(skip({ type: "agent_refused", by: "boss", reason: "cap" }), false, "a new refusal is shown");
  assert.equal(skip({ type: "agent_created", by: "boss", agent: "made-2" }), false);
  assert.equal(skip({ type: "agent_start", agent: "boss" }), false);
});

test("two refusals are in a row only when nothing else comes between them", async () => {
  const create = (name) => JSON.stringify({ action: "create", name, instructions: "x" });
  const d = {
    pattern: "supervisor",
    nodes: [node("boss", "supervisor", { creates: { max: 1, guidance: "", search: false } }), node("researcher", "researcher")],
    edges: [{ from: "boss", to: "researcher" }],
  };
  const { call } = scripted([create("Researcher"), "not json", create("Researcher"), JSON.stringify({ action: "finish", answer: "OK" })]);
  const { result } = await run(d, call);
  assert.equal(result.outcome, "finished");
});

test("a design cannot use the ids of created agents or free places", () => {
  for (const id of ["made-1", "made-22"]) {
    const d = { pattern: "supervisor", nodes: [node("boss", "supervisor"), node(id, "researcher")], edges: [{ from: "boss", to: id }] };
    assert.equal(validateDesign(d).ok, false, id);
  }
});

test("a planner refused twice is told apart from an invalid plan", async () => {
  const d = {
    pattern: "planexec",
    nodes: [node("plan", "planner", { creates: { max: 1, guidance: "", search: false } }), node("exec", "executor")],
    edges: [{ from: "plan", to: "exec" }],
  };
  const reply = JSON.stringify({ agents: [{ name: "Planner", instructions: "x" }], steps: ["a", "b"] });
  const { call } = scripted([reply, reply]);
  const { events } = await run(d, call).catch((e) => ({ events: [{ type: "error", message: String(e.message) }] }));
  const message = events.find((e) => e.type === "error")?.message ?? "";
  assert.ok(message.includes("plan.refused"), message);
});
