import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgent } from "../public/js/engine/agent.js";
import { createBudget } from "../public/js/engine/budget.js";
import { validateRun, RUN_SCHEMA_VERSION } from "../public/js/run-schema.js";
import { LIMIT_DEFAULTS, TOOL_LIMITS } from "../public/js/engine/catalog.js";

const text = (t) => [{ type: "text", text: t }];
const reply = (content, stop_reason = "end_turn") => ({ content, stop_reason, usage: { input_tokens: 10, output_tokens: 5 } });
const asks = (...uses) => reply([{ type: "text", text: "Let me check." }, ...uses.map(([id, name, input]) => ({ type: "tool_use", id, name, input }))], "tool_use");

function setup({ replies, nodeExtra = {}, provider = "anthropic" }) {
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    return replies.shift();
  };
  const events = [];
  const node = { id: "calc", agent: "researcher", model: "fast", search: false, tools: ["calculator", "datetime"], ...nodeExtra };
  const agent = createAgent({ node, call, emit: (e) => events.push(e), budget: createBudget(LIMIT_DEFAULTS), provider, sleep: async () => {} });
  return { agent, calls, events };
}

test("a model that asks for a tool gets the result back, and then answers", async () => {
  const { agent, calls, events } = setup({ replies: [asks(["t1", "calculator", { expression: "1250 * 0.21" }]), reply(text("It is 262.5."))] });
  const result = await agent.run("Task: what is 21 percent of 1250?");
  assert.equal(result.text, "It is 262.5.", "the words before the tool call are not part of the answer");
  assert.deepEqual(events.map((e) => e.type), ["agent_start", "round", "tool_call", "tool_result", "round", "agent_output"]);
  assert.deepEqual(events[0].tools, ["calculator", "datetime"]);
  assert.equal(calls[0].tools.length, 2);
  const second = calls[1].messages;
  assert.equal(second.at(-1).role, "user");
  assert.deepEqual(second.at(-1).content, [{ type: "tool_result", tool_use_id: "t1", content: "262.5" }]);
  assert.equal(second.at(-2).content[1].type, "tool_use", "the request of the model stays in the conversation");
  assert.deepEqual(result.usage, { input: 20, output: 10, searches: 0 });
});

test("a tool call is recorded with the arguments, and its result with the time, and the record is a valid run", async () => {
  const { agent, events } = setup({ replies: [asks(["t1", "calculator", { expression: "2 + 2" }]), reply(text("4"))] });
  await agent.run("Task: x");
  const call = events.find((e) => e.type === "tool_call");
  const result = events.find((e) => e.type === "tool_result");
  assert.equal(call.tool, "calculator");
  assert.equal(call.own, true);
  assert.deepEqual(call.args, { expression: "2 + 2" });
  assert.equal(call.input, JSON.stringify({ expression: "2 + 2" }));
  assert.equal(result.output, "4");
  assert.equal(result.error, false);
  assert.equal(result.own, true);
  assert.equal(typeof result.ms, "number");
  const record = events.map((e, i) => ({ ...e, t: i }));
  const run = { schemaVersion: RUN_SCHEMA_VERSION, id: "r", title: "t", language: "en", pattern: "sequential", appVersion: "1", recordedWith: { provider: "anthropic", model: "m" }, events: record };
  assert.deepEqual(validateRun(run), { ok: true, errors: [] });
});

test("a failing tool call goes back to the model as a message, and the run goes on", async () => {
  const { agent, calls, events } = setup({ replies: [asks(["t1", "calculator", { expression: "1 / 0" }]), reply(text("It cannot be done."))] });
  const result = await agent.run("Task: x");
  assert.equal(result.text, "It cannot be done.");
  const back = calls[1].messages.at(-1).content[0];
  assert.equal(back.is_error, true);
  assert.match(back.content, /zero/i);
  assert.equal(events.find((e) => e.type === "tool_result").error, true);
});

test("several calls in one reply are all answered in one message, in the same order", async () => {
  const { agent, calls } = setup({ replies: [asks(["a", "calculator", { expression: "1 + 1" }], ["b", "datetime", { timezone: "UTC" }]), reply(text("done"))] });
  await agent.run("Task: x");
  const content = calls[1].messages.at(-1).content;
  assert.deepEqual(content.map((c) => c.tool_use_id), ["a", "b"]);
  assert.equal(content[0].content, "2");
  assert.match(content[1].content, /UTC/);
});

test("a tool the agent was not given is refused with a message", async () => {
  const { agent, calls } = setup({ replies: [asks(["t1", "calculator", { expression: "1 + 1" }]), reply(text("ok"))], nodeExtra: { tools: ["datetime"] } });
  await agent.run("Task: x");
  const back = calls[1].messages.at(-1).content[0];
  assert.equal(back.is_error, true);
  assert.match(back.content, /not available/i);
});

test("an agent may make only so many tool calls, and the rest are answered with the limit", async () => {
  const many = Array.from({ length: 3 }, (_, i) => [`t${i}`, "calculator", { expression: `${i} + 1` }]);
  const { agent, calls, events } = setup({ replies: [asks(...many), reply(text("done"))], nodeExtra: { limits: { maxToolCalls: 2 } } });
  await agent.run("Task: x");
  const content = calls[1].messages.at(-1).content;
  assert.equal(content[0].is_error, undefined);
  assert.equal(content[1].is_error, undefined);
  assert.equal(content[2].is_error, true);
  assert.match(content[2].content, /limit/i);
  assert.equal(events.filter((e) => e.type === "tool_call").length, 3, "the refused call is shown too");
});

test(`after ${TOOL_LIMITS.rounds} rounds of tools no tool is offered, so the model has to answer`, async () => {
  const replies = Array.from({ length: TOOL_LIMITS.rounds }, (_, i) => asks([`t${i}`, "calculator", { expression: "1 + 1" }]));
  replies.push(reply(text("final")));
  const { agent, calls } = setup({ replies, nodeExtra: { limits: { maxToolCalls: 50 } } });
  const result = await agent.run("Task: x");
  assert.equal(result.text, "final");
  assert.equal(calls.length, TOOL_LIMITS.rounds + 1);
  assert.ok(calls[TOOL_LIMITS.rounds - 1].tools?.length > 0);
  assert.equal(calls[TOOL_LIMITS.rounds].tools, undefined);
});

test("the tools of our own are not counted as web searches", async () => {
  const { agent } = setup({ replies: [asks(["t1", "calculator", { expression: "2 * 2" }]), reply(text("4"))] });
  const result = await agent.run("Task: x");
  assert.equal(result.usage.searches, 0);
});

test("a run record counts the searches of the provider, and not the calls of the tools of our own", async () => {
  const { buildRunRecord } = await import("../public/js/engine/run-record.js");
  const events = [
    { type: "agent_start", agent: "a", t: 0 },
    { type: "tool_call", agent: "a", tool: "web_search", input: "q", t: 1 },
    { type: "tool_call", agent: "a", tool: "calculator", own: true, input: "{}", t: 2 },
    { type: "agent_output", agent: "a", text: "x", tokens: { input: 1, output: 1 }, t: 3 },
    { type: "done", outcome: "ok", t: 4 },
  ];
  const record = buildRunRecord({ id: "r", design: { pattern: "sequential", nodes: [], edges: [] }, task: "t", events, limits: {}, language: "en", appVersion: "1", startedAt: 0, endedAt: 1 });
  assert.equal(record.usage.searches, 1);
});

test("the mock provider asks for a tool of ours and then answers, so a run can be tried without a key", async () => {
  const { createMockCall } = await import("../public/js/engine/mock-anthropic.js");
  const { runDesign } = await import("../public/js/engine/orchestrator.js");
  const design = { pattern: "sequential", nodes: [{ id: "a", agent: "researcher", model: "fast", search: false, tools: ["calculator"] }], edges: [] };
  const events = [];
  await runDesign({ design, task: "t", limits: {}, call: createMockCall(), emit: (e) => events.push(e), allowSearch: true });
  const result = events.find((e) => e.type === "tool_result");
  assert.equal(result.output, "42");
  assert.match(events.find((e) => e.type === "agent_output").text, /The tool said: 42/);
});
