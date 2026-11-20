import { test } from "node:test";
import assert from "node:assert/strict";
import { createRunHandler } from "../lib/run-handler.js";
import { API_LOG_BODY_MAX } from "../public/js/engine/api-log.js";

const KEY = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX";
const reply = { id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "hello there" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } };
const design = { pattern: "sequential", nodes: [{ id: "planner", agent: "planner", model: "fast", search: false }, { id: "writer", agent: "writer", model: "fast", search: false }], edges: [{ from: "planner", to: "writer" }] };

test("the log of a small run stays small, and no body is over the cap", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } });
  const res = { chunks: [], setHeader() {}, flushHeaders() {}, write(c) { this.chunks.push(String(c)); return true; }, end(c) { if (c) this.chunks.push(String(c)); }, on() {} };
  try {
    await createRunHandler({ rateLimitImpl: () => true, env: {} })({ method: "POST", headers: {}, body: { design, task: "Why is the sky blue?", limits: {}, language: "en", apiKey: KEY } }, res);
  } finally {
    globalThis.fetch = original;
  }
  const all = res.chunks.join("").split("\n\n").filter((b) => b.startsWith("data: ")).map((b) => JSON.parse(b.slice(6)));
  const calls = all.filter((e) => e.type === "api_call");
  const rest = all.filter((e) => e.type !== "api_call");
  assert.equal(calls.length, 2);
  assert.ok(JSON.stringify(calls).length < 20000, "the log of two small calls is small");
  assert.ok(JSON.stringify(calls).length < 4 * JSON.stringify(rest).length, "the log stays in proportion to the run");
  for (const c of calls) {
    assert.ok(c.request.body.length <= API_LOG_BODY_MAX);
    assert.ok(c.response.body.length <= API_LOG_BODY_MAX);
  }
});
