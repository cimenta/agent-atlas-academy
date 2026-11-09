import { test } from "node:test";
import assert from "node:assert/strict";
import { createAgent } from "../public/js/engine/agent.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";
import { TOOLS, toolsFor } from "../public/js/engine/tools.js";
import { createBudget } from "../public/js/engine/budget.js";
import { AnthropicError } from "../public/js/engine/anthropic.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const reply = (content, stop_reason = "end_turn", usage = { input_tokens: 10, output_tokens: 5 }) => ({ content, stop_reason, usage });
const text = (t) => [{ type: "text", text: t }];
const node = (extra = {}) => ({ id: "critic", agent: "critic", model: "fast", search: false, ...extra });

function scripted(replies) {
  const calls = [];
  const call = async (body, opts) => {
    calls.push({ body: structuredClone(body), opts });
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  return { call, calls };
}

function setup({ replies, nodeExtra, limits = LIMIT_DEFAULTS, sleep = async () => {}, signal } = {}) {
  const { call, calls } = scripted(replies);
  const events = [];
  const budget = createBudget(limits);
  const agent = createAgent({ node: node(nodeExtra), call, emit: (e) => events.push(e), budget, signal, language: "en", sleep });
  return { agent, calls, events, budget };
}

test("a plain reply emits agent_start then agent_output with tokens and returns the text", async () => {
  const { agent, events } = setup({ replies: [reply(text("hello"))] });
  const result = await agent.run("Task: x");
  assert.equal(result.text, "hello");
  assert.deepEqual(result.usage, { input: 10, output: 5, searches: 0 });
  assert.deepEqual(events.map((e) => e.type), ["agent_start", "agent_output"]);
  assert.equal(events[0].agent, "critic");
  assert.equal(events[0].role, "Critic");
  assert.deepEqual(events[1], { type: "agent_output", agent: "critic", text: "hello", tokens: { input: 10, output: 5 } });
});

test("the second run sends the earlier messages again", async () => {
  const { agent, calls } = setup({ replies: [reply(text("one")), reply(text("two"))] });
  await agent.run("first");
  await agent.run("second");
  assert.equal(calls[0].body.messages.length, 1);
  assert.equal(calls[1].body.messages.length, 3);
  assert.equal(calls[1].body.messages[2].content, "second");
});

test("the request uses the chosen model, the system prompt and a token cap", async () => {
  const { agent, calls } = setup({ replies: [reply(text("x"))], nodeExtra: { model: "balanced" } });
  await agent.run("t");
  assert.equal(calls[0].body.model, "claude-sonnet-5-5");
  assert.ok(calls[0].body.system.startsWith("Role: critic"));
  assert.equal(calls[0].body.max_tokens, 4000);
});

test("max_tokens is capped by the remaining token budget", async () => {
  const { agent, calls } = setup({ replies: [reply(text("x"))], limits: { ...LIMIT_DEFAULTS, maxTokens: 1000 } });
  await agent.run("t");
  assert.equal(calls[0].body.max_tokens, 1000);
});

test("search blocks become tool_call and tool_result events", async () => {
  const blocks = [
    { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "sky colour" } },
    { type: "web_search_tool_result", tool_use_id: "s1", content: [{ title: "Sky", url: "https://example.org/sky" }] },
    { type: "text", text: "found it" },
  ];
  const { agent, events, budget } = setup({
    replies: [reply(blocks, "end_turn", { input_tokens: 10, output_tokens: 5, server_tool_use: { web_search_requests: 1 } })],
    nodeExtra: { agent: "researcher", id: "researcher", search: true },
  });
  const result = await agent.run("t");
  assert.deepEqual(events.map((e) => e.type), ["agent_start", "tool_call", "tool_result", "agent_output"]);
  assert.deepEqual([events[1].tool, events[1].input], ["web_search", "sky colour"]);
  assert.ok(events[2].output.includes("Sky") && events[2].output.includes("https://example.org/sky"));
  assert.equal(result.usage.searches, 1);
  assert.equal(budget.usage().searches, 1);
});

test("tools are offered only when search is on and searches remain", async () => {
  const off = setup({ replies: [reply(text("x"))] });
  await off.agent.run("t");
  assert.equal(off.calls[0].body.tools, undefined);
  const on = setup({ replies: [reply(text("x"))], nodeExtra: { search: true } });
  await on.agent.run("t");
  assert.equal(on.calls[0].body.tools[0].name, "web_search");
  assert.equal(on.calls[0].body.tools[0].max_uses, 3);
  const none = setup({ replies: [reply(text("x"))], nodeExtra: { search: true }, limits: { ...LIMIT_DEFAULTS, maxSearches: 0 } });
  await none.agent.run("t");
  assert.equal(none.calls[0].body.tools, undefined);
});

test("the tool registry describes web search as an extra-fee tool", () => {
  assert.equal(TOOLS.web_search.extraFee, true);
  assert.equal(TOOLS.web_search.definition(2).max_uses, 2);
  assert.deepEqual(toolsFor({ search: false }, createBudget(LIMIT_DEFAULTS)), []);
});

test("pause_turn continues the same turn, at most four times", async () => {
  const pause = () => reply([{ type: "text", text: "" }], "pause_turn");
  const ok = setup({ replies: [pause(), pause(), pause(), pause(), reply(text("done"))] });
  const result = await ok.agent.run("t");
  assert.equal(result.text, "done");
  assert.equal(ok.calls.length, 5);
  const bad = setup({ replies: [pause(), pause(), pause(), pause(), pause()] });
  await assert.rejects(bad.agent.run("t"), /pause/i);
});

test("a reply cut by max_tokens emits a warning and returns the partial text", async () => {
  const { agent, events } = setup({ replies: [reply(text("partial"), "max_tokens")] });
  const result = await agent.run("t");
  assert.equal(result.text, "partial");
  assert.ok(events.some((e) => e.type === "warning"));
});

test("one retryable error is retried after a visible warning", async () => {
  const sleeps = [];
  const { agent, events, calls } = setup({
    replies: [new AnthropicError("overloaded", { status: 529, retryable: true }), reply(text("ok"))],
    sleep: async (ms) => sleeps.push(ms),
  });
  const result = await agent.run("t");
  assert.equal(result.text, "ok");
  assert.deepEqual(sleeps, [1500]);
  assert.equal(events.filter((e) => e.type === "warning").length, 1);
  assert.equal(calls.length, 2);
});

test("two retryable errors in a row throw", async () => {
  const err = () => new AnthropicError("overloaded", { status: 529, retryable: true });
  const { agent } = setup({ replies: [err(), err()] });
  await assert.rejects(agent.run("t"), (e) => e instanceof AnthropicError);
});

test("a non-retryable error throws at once without sleeping", async () => {
  const sleeps = [];
  const { agent } = setup({ replies: [new AnthropicError("bad request", { status: 400 })], sleep: async (ms) => sleeps.push(ms) });
  await assert.rejects(agent.run("t"), (e) => e.status === 400);
  assert.deepEqual(sleeps, []);
});

test("every provider call is one step", async () => {
  const { agent, budget } = setup({ replies: [reply(text("a")), reply(text("b"))] });
  await agent.run("1");
  await agent.run("2");
  assert.equal(budget.usage().steps, 2);
});

test("the signal is passed to the provider call", async () => {
  const controller = new AbortController();
  const { agent, calls } = setup({ replies: [reply(text("x"))], signal: controller.signal });
  await agent.run("t");
  assert.equal(calls[0].opts.signal, controller.signal);
});

test("a key-shaped string in a retry warning is redacted", async () => {
  const { agent, events } = setup({
    replies: [new AnthropicError("failed for sk-ant-api03-LEAKLEAKLEAK", { status: 529, retryable: true }), reply(text("ok"))],
  });
  await agent.run("t");
  assert.ok(!JSON.stringify(events).includes("LEAKLEAKLEAK"));
});

test("system prompts start with the role line and carry language, stance and free instructions", () => {
  assert.ok(systemPromptFor(node(), { language: "en" }).startsWith("Role: critic\n"));
  assert.ok(systemPromptFor(node(), { language: "cs" }).includes("Czech"));
  assert.ok(systemPromptFor(node(), { language: "en" }).includes("English"));
  const debater = systemPromptFor({ id: "d", agent: "debater", stance: "against", model: "fast", search: false }, { language: "en" });
  assert.ok(debater.includes("against"));
  const free = systemPromptFor({ id: "f", agent: "free", name: "Pirate", instructions: "Talk like a pirate.", model: "fast", search: false }, { language: "en" });
  assert.ok(free.includes("Pirate") && free.includes("Talk like a pirate."));
  const supervisor = systemPromptFor({ id: "s", agent: "supervisor", model: "fast", search: false }, { language: "en" });
  assert.ok(supervisor.includes('"action":"call"') && supervisor.includes('"action":"finish"'));
  const judge = systemPromptFor({ id: "j", agent: "judge", model: "fast", search: false }, { language: "en" });
  assert.ok(!judge.includes('"action"'));
});
