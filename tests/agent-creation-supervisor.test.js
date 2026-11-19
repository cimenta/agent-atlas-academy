import { test } from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { parseSupervisorReply } from "../public/js/engine/runners/supervisor.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const createJson = (name, instructions = "Check each claim.") => JSON.stringify({ action: "create", name, instructions });
const callJson = (worker, instruction = "do it") => JSON.stringify({ action: "call", worker, instruction });
const finishJson = (answer = "FINAL") => JSON.stringify({ action: "finish", answer });

function scripted(replies) {
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    const next = replies.shift();
    if (next === undefined) throw new Error("script ran out");
    return text(next);
  };
  return { call, calls };
}
const design = (max = 2, extra = {}) => ({
  pattern: "supervisor",
  nodes: [node("boss", "supervisor", { creates: { max, guidance: "", search: false, ...extra } }), node("researcher", "researcher")],
  edges: [{ from: "boss", to: "researcher" }],
});
async function run(d, call) {
  const events = [];
  const result = await runDesign({ design: d, task: "Should we?", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  return { result, events };
}
const lastInput = (calls, i) => calls[i].messages.at(-1).content;

test("a create action is read", () => {
  assert.deepEqual(parseSupervisorReply(createJson("Fact checker", "Check.")), { action: "create", name: "Fact checker", instructions: "Check." });
  assert.equal(parseSupervisorReply('{"action":"create","instructions":"x"}'), null);
  assert.equal(parseSupervisorReply('{"action":"create","name":"A","instructions":5}'), null);
});

test("the supervisor creates an agent, calls it and finishes", async () => {
  const { call, calls } = scripted([createJson("Fact checker"), callJson("made-1", "check the draft"), "CHECKED", finishJson("DONE")]);
  const { result, events } = await run(design(), call);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "DONE");
  const created = events.find((e) => e.type === "agent_created");
  assert.equal(created.agent, "made-1");
  assert.equal(created.node.name, "Fact checker");
  assert.equal(created.max, 2);
  assert.ok(lastInput(calls, 1).includes("Created Fact checker (id made-1)"));
  assert.ok(lastInput(calls, 1).includes("researcher, made-1"));
  assert.ok(calls[2].messages[0].content.includes("check the draft"));
  assert.ok(calls[2].system.includes("Fact checker"));
  assert.ok(events.some((e) => e.type === "agent_start" && e.agent === "made-1"));
  assert.deepEqual(events.filter((e) => e.type === "handoff").map((e) => `${e.from}>${e.to}`), ["boss>made-1", "made-1>boss"]);
  assert.ok(result.usage.input >= 40);
});

test("a refused request tells the supervisor why, and the run goes on", async () => {
  const { call, calls } = scripted([createJson("Researcher"), createJson("Editor", "Edit."), callJson("made-1"), "EDITED", finishJson("OK")]);
  const { result, events } = await run(design(), call);
  assert.equal(result.outcome, "finished");
  assert.equal(events.filter((e) => e.type === "agent_refused").length, 1);
  assert.equal(events.find((e) => e.type === "agent_refused").reason, "name-taken");
  assert.ok(lastInput(calls, 1).startsWith("Creating refused:"));
  assert.ok(lastInput(calls, 1).includes("Valid workers: researcher."));
});

test("the cap is told and kept", async () => {
  const { call, calls } = scripted([createJson("A"), createJson("B"), finishJson("OK")]);
  const { result, events } = await run(design(1), call);
  assert.equal(result.outcome, "finished");
  assert.equal(events.filter((e) => e.type === "agent_created").length, 1);
  assert.equal(events.find((e) => e.type === "agent_refused").reason, "cap");
  assert.ok(lastInput(calls, 2).startsWith("Creating refused:"));
  assert.ok(lastInput(calls, 2).includes("already created all"));
});

test("two refusals in a row end the run", async () => {
  const { call } = scripted([createJson("Researcher"), createJson("RESEARCHER")]);
  const { result, events } = await run(design(), call);
  assert.equal(result.outcome, "failed");
  assert.ok(events.find((e) => e.type === "error").message.includes("supervisor.refused"));
});

test("a supervisor that may not create gets an invalid reply for a create action", async () => {
  const plain = { pattern: "supervisor", nodes: [node("boss", "supervisor"), node("researcher", "researcher")], edges: [{ from: "boss", to: "researcher" }] };
  const { call } = scripted([createJson("A"), createJson("B")]);
  const { result, events } = await run(plain, call);
  assert.equal(result.outcome, "failed");
  assert.ok(events.find((e) => e.type === "error").message.includes("supervisor.invalid"));
});

test("the prompt of a supervisor that may create says how, and only then", () => {
  const withIt = systemPromptFor({ ...node("boss", "supervisor"), creates: { max: 3, guidance: "prefer small specialists", search: false } }, { pattern: "supervisor" });
  assert.ok(withIt.includes('"action":"create"'));
  assert.ok(withIt.includes("up to 3"));
  assert.ok(withIt.includes("prefer small specialists"));
  assert.ok(/cannot create|can not create|may not create/i.test(withIt));
  const without = systemPromptFor(node("boss", "supervisor"), { pattern: "supervisor" });
  assert.ok(!without.includes('"action":"create"'));
});

test("a mock run creates an agent and uses it", async () => {
  const { result, events } = await run(design(2), createMockCall());
  assert.equal(result.outcome, "finished");
  assert.equal(events.filter((e) => e.type === "agent_created").length, 1);
  assert.ok(events.some((e) => e.type === "agent_output" && e.agent === "made-1"));
});
