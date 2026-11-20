import { test } from "node:test";
import assert from "node:assert/strict";
import { toChatRequest, fromChatResponse, callChatCompletions, listChatModels } from "../public/js/engine/openai-compat.js";
import { callGroq, listGroqModels } from "../public/js/engine/groq.js";
import { AnthropicError, redact } from "../public/js/engine/anthropic.js";
import { providerCalls } from "../lib/provider-calls.js";
import { createRunHandler } from "../lib/run-handler.js";
import { createModelsHandler } from "../lib/models-handler.js";

const KEY = `gsk_${"k".repeat(40)}`;
const reply = (status, data, headers = {}) => ({ ok: status < 400, status, headers: new Headers(headers), json: async () => data });

test("the request: system first, text, tools, schema, max tokens, reasoning effort", () => {
  const out = toChatRequest({ model: "openai/gpt-oss-20b", max_tokens: 700, system: "Be brief.", messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: [{ type: "text", text: "Hello" }] }] }, { model: "openai/gpt-oss-20b" });
  assert.equal(out.model, "openai/gpt-oss-20b");
  assert.equal(out.max_completion_tokens, 700);
  assert.equal(out.reasoning_effort, "low");
  assert.deepEqual(out.messages, [{ role: "system", content: "Be brief." }, { role: "user", content: "Hi" }, { role: "assistant", content: "Hello" }]);
  assert.equal("max_tokens" in out, false);
});

test("tool use and tool results become tool_calls and the tool role; tools become functions", () => {
  const out = toChatRequest({
    model: "m", max_tokens: 100,
    tools: [{ name: "note", description: "write a note", input_schema: { type: "object", properties: {} } }],
    messages: [
      { role: "user", content: "go" },
      { role: "assistant", content: [{ type: "text", text: "ok" }, { type: "tool_use", id: "t1", name: "note", input: { a: 1 } }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "done" }] },
    ],
  }, { model: "m" });
  assert.deepEqual(out.tools, [{ type: "function", function: { name: "note", description: "write a note", parameters: { type: "object", properties: {} } } }]);
  assert.deepEqual(out.messages[1], { role: "assistant", content: "ok", tool_calls: [{ id: "t1", type: "function", function: { name: "note", arguments: '{"a":1}' } }] });
  assert.deepEqual(out.messages[2], { role: "tool", tool_call_id: "t1", content: "done" });
});

test("replySchema becomes a json_schema format, and is dropped when tools exist", () => {
  const schema = { type: "object", properties: { x: { type: "string" } }, required: ["x"] };
  const alone = toChatRequest({ model: "m", max_tokens: 9, messages: [], replySchema: schema }, { model: "m" });
  assert.deepEqual(alone.response_format, { type: "json_schema", json_schema: { name: "reply", strict: false, schema } });
  const withTools = toChatRequest({ model: "m", max_tokens: 9, messages: [], replySchema: schema, tools: [{ name: "n", description: "d", input_schema: {} }] }, { model: "m" });
  assert.equal("response_format" in withTools, false);
});

test("the answer: text, tool calls, finish reasons and usage", () => {
  const a = fromChatResponse({ choices: [{ message: { content: "Hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 12, completion_tokens: 5 } });
  assert.deepEqual(a.content, [{ type: "text", text: "Hi" }]);
  assert.equal(a.stop_reason, "end_turn");
  assert.deepEqual(a.usage, { input_tokens: 12, output_tokens: 5 });
  assert.equal(fromChatResponse({ choices: [{ message: { content: "x" }, finish_reason: "length" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }).stop_reason, "max_tokens");
  const t = fromChatResponse({ choices: [{ message: { content: null, tool_calls: [{ id: "c1", function: { name: "note", arguments: "{bad" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  assert.equal(t.stop_reason, "tool_use");
  assert.deepEqual(t.content.find((b) => b.type === "tool_use"), { type: "tool_use", id: "c1", name: "note", input: {} });
});

test("a missing usage is estimated and marked; empty choices throw", () => {
  const a = fromChatResponse({ choices: [{ message: { content: "abcdefgh" }, finish_reason: "stop" }] });
  assert.equal(a.usage.estimated, true);
  assert.equal(a.usage.output_tokens, 2);
  const half = fromChatResponse({ choices: [{ message: { content: "abcd" }, finish_reason: "stop" }], usage: { prompt_tokens: 7 } });
  assert.equal(half.usage.input_tokens, 7);
  assert.equal(half.usage.output_tokens, 1);
  assert.throws(() => fromChatResponse({ choices: [] }), AnthropicError);
});

test("callGroq sends a bearer key to the Groq address and returns the Anthropic-shaped answer", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return reply(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2 } }, { "x-ratelimit-remaining-tokens": "7000" });
  };
  const answer = await callGroq({ model: "openai/gpt-oss-20b", max_tokens: 50, messages: [{ role: "user", content: "Hi" }] }, { apiKey: KEY, fetchImpl });
  assert.equal(seen[0].url, "https://api.groq.com/openai/v1/chat/completions");
  assert.equal(seen[0].init.headers.authorization, `Bearer ${KEY}`);
  assert.equal(JSON.parse(seen[0].init.body).model, "openai/gpt-oss-20b");
  assert.equal(answer.model, "openai/gpt-oss-20b");
  assert.equal(answer._meta.status, 200);
  assert.equal(answer._meta.headers["x-ratelimit-remaining-tokens"], "7000");
});

test("a 429 carries the wait the provider asked for and what kind of limit it was", async () => {
  const run = (data, headers) => callGroq({ model: "m", max_tokens: 5, messages: [] }, { apiKey: KEY, fetchImpl: async () => reply(429, data, headers) }).catch((e) => e);
  const minute = await run({ error: { message: "Rate limit reached ... on tokens per minute (TPM)" } }, { "retry-after": "23" });
  assert.equal(minute.status, 429);
  assert.equal(minute.retryable, true);
  assert.equal(minute.retryAfterSec, 23);
  assert.equal(minute.rateKind, "minute");
  const day = await run({ error: { message: "Rate limit reached ... on tokens per day (TPD)" } }, { "retry-after": "21600" });
  assert.equal(day.rateKind, "day");
  assert.equal(day.retryAfterSec, 21600);
  assert.equal((await run({ error: { message: "slow" } }, {})).retryAfterSec, null);
  assert.equal((await run({ error: { message: "slow" } }, { "retry-after": "abc" })).retryAfterSec, null);
});

test("the key is hidden in an error body and in a network error", async () => {
  const error = await callGroq({ model: "m", max_tokens: 5, messages: [] }, { apiKey: KEY, fetchImpl: async () => reply(401, { error: { message: `bad key ${KEY}` } }) }).catch((e) => e);
  assert.doesNotMatch(error.message, new RegExp(KEY));
  assert.equal(error.retryable, false);
  const net = await callGroq({ model: "m", max_tokens: 5, messages: [] }, { apiKey: KEY, fetchImpl: async () => { throw new Error(`down ${KEY}`); } }).catch((e) => e);
  assert.doesNotMatch(net.message, new RegExp(KEY));
  assert.equal(net.retryable, true);
  assert.doesNotMatch(redact(`x ${KEY} y`, ""), /gsk_/);
});

test("a cancelled call says so", async () => {
  const control = new AbortController();
  control.abort();
  const error = await callGroq({ model: "m", max_tokens: 5, messages: [] }, { apiKey: KEY, signal: control.signal, fetchImpl: async () => reply(200, {}) }).catch((e) => e);
  assert.match(error.message, /cancelled/);
});

test("the list of models is the ids of the answer", async () => {
  const ids = await listGroqModels({ apiKey: KEY, fetchImpl: async () => reply(200, { data: [{ id: "openai/gpt-oss-20b" }, { id: "openai/gpt-oss-120b" }] }) });
  assert.deepEqual(ids, ["openai/gpt-oss-20b", "openai/gpt-oss-120b"]);
  assert.deepEqual(await listChatModels({ apiKey: KEY, url: "https://x.test/models", who: "X", fetchImpl: async () => reply(200, {}) }), []);
});

test("providerCalls has a call for Groq, and the handler uses it for a Groq slot", async () => {
  assert.equal(providerCalls({}).groq, callGroq);
  const keys = { "groq-free": KEY };
  const seen = [];
  const handler = createRunHandler({
    callGroq: async (body, opts) => {
      seen.push({ model: body.model, apiKey: opts.apiKey });
      return { content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
    },
    rateLimitImpl: () => true,
  });
  const chunks = [];
  const res = { statusCode: 0, setHeader() {}, flushHeaders() {}, write: (c) => chunks.push(c), end: (c) => c && chunks.push(c), on() {} };
  const design = { pattern: "sequential", nodes: [{ id: "a", agent: "planner", model: "fast", search: false, slot: "groq-free" }], edges: [] };
  await handler({ method: "POST", headers: {}, socket: {}, body: { provider: "groq", keys, task: "hello", design, limits: {} } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(seen[0], { model: "openai/gpt-oss-20b", apiKey: KEY });
});

test("the model list endpoint serves Groq and refuses an Anthropic key for it", async () => {
  const handler = createModelsHandler({ lists: { groq: async () => ["openai/gpt-oss-20b"] }, rateLimitImpl: () => true });
  const out = [];
  const res = { statusCode: 0, setHeader() {}, end: (c) => out.push(c) };
  await handler({ method: "POST", headers: {}, socket: {}, body: { provider: "groq", key: KEY } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(out[0]).catalogFound, ["openai/gpt-oss-20b"]);
  const bad = { statusCode: 0, setHeader() {}, end() {} };
  await handler({ method: "POST", headers: {}, socket: {}, body: { provider: "groq", key: `sk-ant-${"x".repeat(30)}` } }, bad);
  assert.equal(bad.statusCode, 400);
});

test("an answer with no prompt_tokens estimates the input from the request, not 0", async () => {
  const { callChatCompletions } = await import("../public/js/engine/openai-compat.js");
  const fetchImpl = async () => ({ ok: true, status: 200, headers: new Map(), json: async () => ({ choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }], usage: {} }) });
  const answer = await callChatCompletions({ model: "m", max_tokens: 50, system: "s".repeat(400), messages: [{ role: "user", content: [{ type: "text", text: "q".repeat(400) }] }] }, { apiKey: "k".repeat(20), fetchImpl, url: "http://x" });
  assert.ok(answer.usage.input_tokens >= 150, String(answer.usage.input_tokens));
  assert.equal(answer.usage.estimated, true);
});
