import { test } from "node:test";
import assert from "node:assert/strict";
import { callAnthropic, AnthropicError } from "../public/js/engine/anthropic.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";

const KEY = "sk-ant-api03-SECRETSECRETSECRET";
const okResponse = (data) => ({ ok: true, status: 200, json: async () => data });
const errResponse = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });

test("the request goes to the Anthropic URL with the key only in a header", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return okResponse({ content: [], usage: {} });
  };
  const body = { model: "m", messages: [] };
  await callAnthropic(body, { apiKey: KEY, fetchImpl });
  assert.equal(seen.url, "https://api.anthropic.com/v1/messages");
  assert.equal(seen.init.method, "POST");
  assert.equal(seen.init.headers["x-api-key"], KEY);
  assert.equal(seen.init.headers["anthropic-version"], "2023-06-01");
  assert.ok(!seen.init.body.includes(KEY));
  assert.deepEqual(JSON.parse(seen.init.body), body);
});

test("an error response throws AnthropicError and never repeats the key", async () => {
  const fetchImpl = async () => errResponse(401, `invalid x-api-key ${KEY}`);
  await assert.rejects(
    callAnthropic({}, { apiKey: KEY, fetchImpl }),
    (e) => e instanceof AnthropicError && e.status === 401 && !e.message.includes(KEY) && e.retryable === false,
  );
});

test("429, 500, 502, 503 and 529 are retryable; 400 and 401 are not", async () => {
  for (const [status, retryable] of [[429, true], [500, true], [502, true], [503, true], [529, true], [400, false], [401, false]]) {
    const fetchImpl = async () => errResponse(status, "x");
    await assert.rejects(callAnthropic({}, { apiKey: KEY, fetchImpl }), (e) => e.status === status && e.retryable === retryable, String(status));
  }
});

test("a network error that mentions the key is redacted", async () => {
  const fetchImpl = async () => {
    throw new Error(`connect failed while sending ${KEY}`);
  };
  await assert.rejects(
    callAnthropic({}, { apiKey: KEY, fetchImpl }),
    (e) => e instanceof AnthropicError && !e.message.includes(KEY) && e.message.includes("[redacted]"),
  );
});

test("any sk-ant style token is redacted even when it is not the current key", async () => {
  const fetchImpl = async () => errResponse(400, "bad token sk-ant-api03-OTHEROTHEROTHER here");
  await assert.rejects(callAnthropic({}, { apiKey: KEY, fetchImpl }), (e) => !e.message.includes("OTHEROTHER"));
});

test("a hung request times out", async () => {
  const fetchImpl = (url, init) => new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  await assert.rejects(
    callAnthropic({}, { apiKey: KEY, fetchImpl, timeoutMs: 20 }),
    (e) => e instanceof AnthropicError && e.retryable === false && /time/i.test(e.message),
  );
});

test("an aborted signal rejects without calling fetch, and abort during the call rejects", async () => {
  let calls = 0;
  const fetchImpl = (url, init) => {
    calls += 1;
    return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(init.signal.reason)));
  };
  const done = new AbortController();
  done.abort();
  await assert.rejects(callAnthropic({}, { apiKey: KEY, fetchImpl, signal: done.signal }), (e) => e instanceof AnthropicError && /cancel/i.test(e.message));
  assert.equal(calls, 0);
  const live = new AbortController();
  const pending = callAnthropic({}, { apiKey: KEY, fetchImpl, signal: live.signal });
  live.abort();
  await assert.rejects(pending, (e) => e instanceof AnthropicError && /cancel/i.test(e.message) && e.retryable === false);
  assert.equal(calls, 1);
});

test("a missing key is refused before any request", async () => {
  let calls = 0;
  await assert.rejects(callAnthropic({}, { apiKey: "", fetchImpl: async () => { calls += 1; } }), AnthropicError);
  assert.equal(calls, 0);
});

test("the mock answers by role with a Messages-shaped reply", async () => {
  const call = createMockCall();
  const reply = await call({ system: "Role: planner\nPlan things.", messages: [{ role: "user", content: "Task: x" }] });
  assert.ok(Array.isArray(reply.content) && reply.content[0].type === "text");
  assert.ok(reply.usage.input_tokens > 0 && reply.usage.output_tokens > 0);
  assert.equal(reply.stop_reason, "end_turn");
});

test("the mock researcher uses a search block pair only when tools are offered", async () => {
  const call = createMockCall();
  const system = "Role: researcher";
  const withTools = await call({ system, tools: [{ name: "web_search" }], messages: [{ role: "user", content: "Task: x" }] });
  assert.deepEqual(withTools.content.map((b) => b.type), ["server_tool_use", "web_search_tool_result", "text"]);
  assert.equal(withTools.usage.server_tool_use.web_search_requests, 1);
  const without = await call({ system, messages: [{ role: "user", content: "Task: x" }] });
  assert.deepEqual(without.content.map((b) => b.type), ["text"]);
});

test("the mock supervisor calls each worker once and then finishes", async () => {
  const call = createMockCall();
  const system = "Role: supervisor";
  const messages = [{ role: "user", content: "Task: x\nWorkers: researcher, writer" }];
  const parse = (r) => JSON.parse(r.content[0].text);
  const first = parse(await call({ system, messages }));
  assert.deepEqual([first.action, first.worker], ["call", "researcher"]);
  messages.push({ role: "assistant", content: "..." }, { role: "user", content: "Result from researcher:\nfacts" });
  const second = parse(await call({ system, messages }));
  assert.deepEqual([second.action, second.worker], ["call", "writer"]);
  messages.push({ role: "assistant", content: "..." }, { role: "user", content: "Result from writer:\ntext" });
  const third = parse(await call({ system, messages }));
  assert.equal(third.action, "finish");
  assert.ok(third.answer.length > 0);
});

test("the mock honours an aborted signal", async () => {
  const call = createMockCall();
  const done = new AbortController();
  done.abort();
  await assert.rejects(call({ system: "Role: planner", messages: [] }, { signal: done.signal }), AnthropicError);
});
