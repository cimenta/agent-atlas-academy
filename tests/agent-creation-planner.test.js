import { test } from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { parsePlanReply, parseStepsReply } from "../public/js/engine/runners/planexec.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const design = (max = 2) => ({ pattern: "planexec", nodes: [node("plan", "planner", { creates: { max, guidance: "", search: false } }), node("exec", "executor")], edges: [{ from: "plan", to: "exec" }] });
const plain = () => ({ pattern: "planexec", nodes: [node("plan", "planner"), node("exec", "executor")], edges: [{ from: "plan", to: "exec" }] });
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
async function run(d, call) {
  const events = [];
  const result = await runDesign({ design: d, task: "Write a report", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  return { result, events };
}
const plan = (agents, steps) => JSON.stringify({ agents, steps });
const analyst = { name: "Data analyst", instructions: "You analyse numbers." };

test("a plan reply may name created agents and give steps to them", () => {
  assert.deepEqual(parsePlanReply('{"steps":["a","b"]}'), { steps: [{ text: "a", agent: null }, { text: "b", agent: null }], agents: [] });
  assert.deepEqual(parsePlanReply(plan([analyst], ["a", { text: "b", agent: "data analyst" }])), { steps: [{ text: "a", agent: null }, { text: "b", agent: "Data analyst" }], agents: [analyst] });
  assert.equal(parsePlanReply(plan([analyst], ["a", { text: "b", agent: "Nobody" }])), null);
  assert.equal(parsePlanReply(plan([{ name: "", instructions: "x" }], ["a", "b"])), null);
  assert.equal(parsePlanReply(plan([analyst], ["only one"])), null);
  assert.equal(parsePlanReply('{"steps":["a","b"],"agents":"x"}'), null);
});

test("the old parser of steps still gives texts", () => {
  assert.deepEqual(parseStepsReply('{"steps":["a","b"]}'), ["a", "b"]);
});

test("the planner creates an agent and a step runs on it", async () => {
  const { call, calls } = scripted([plan([analyst], ["Collect figures.", { text: "Analyse the trend.", agent: "Data analyst" }, "Write the summary."]), "FIGURES", "TREND", "SUMMARY"]);
  const { result, events } = await run(design(), call);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "SUMMARY");
  assert.equal(events.find((e) => e.type === "agent_created").node.name, "Data analyst");
  assert.ok(calls[2].system.includes("You analyse numbers."));
  assert.ok(calls[2].messages[0].content.includes("Now do step 2: Analyse the trend."));
  assert.ok(calls[2].messages[0].content.includes("FIGURES"));
  const starts = events.filter((e) => e.type === "agent_start").map((e) => e.agent);
  assert.deepEqual(starts, ["plan", "exec#1", "made-1", "exec#3"]);
  assert.ok(events.some((e) => e.type === "handoff" && e.from === "exec#1" && e.to === "made-1"));
});

test("a refused creation is repaired once, with the agents already made kept", async () => {
  const { call, calls } = scripted([plan([analyst, { name: "Editor", instructions: "Edit." }], ["a", "b"]), plan([analyst, { name: "Editor", instructions: "Edit." }], ["a", { text: "b", agent: "Editor" }]), "A", "B"]);
  const { result, events } = await run(design(1), call);
  assert.equal(result.outcome, "failed");
  assert.equal(events.filter((e) => e.type === "agent_created").length, 1);
  assert.equal(events.filter((e) => e.type === "agent_refused").length >= 1, true);
  assert.ok(calls[1].messages.at(-1).content.startsWith("Creating refused:"));
});

test("a planner that may not create gets an invalid plan for a reply with agents", async () => {
  const { call } = scripted([plan([analyst], ["a", "b"]), plan([analyst], ["a", "b"])]);
  const { result, events } = await run(plain(), call);
  assert.equal(result.outcome, "failed");
  assert.ok(events.find((e) => e.type === "error").message.includes("plan.invalid"));
});

test("the prompt of a planner that may create says how", () => {
  const withIt = systemPromptFor({ ...node("plan", "planner"), creates: { max: 2, guidance: "small specialists", search: false } }, { pattern: "planexec" });
  assert.ok(withIt.includes('"agents"'));
  assert.ok(withIt.includes("up to 2"));
  assert.ok(withIt.includes("small specialists"));
  assert.ok(!systemPromptFor(node("plan", "planner"), { pattern: "planexec" }).includes('"agents"'));
});

test("a mock run of a planner that may create gives a step to the created agent", async () => {
  const { result, events } = await run(design(1), createMockCall());
  assert.equal(result.outcome, "finished");
  assert.equal(events.filter((e) => e.type === "agent_created").length, 1);
  assert.ok(events.some((e) => e.type === "agent_output" && e.agent === "made-1"));
});
