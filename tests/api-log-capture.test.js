import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { loggedCall } from "../public/js/engine/api-log.js";
import { createRunHandler } from "../lib/run-handler.js";

const KEY = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX";
const reply = { id: "msg_1", type: "message", role: "assistant", model: "claude-haiku-5-5", content: [{ type: "text", text: "hello there" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } };
const jsonResponse = (status, body, headers = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

test("loggedCall emits one api_call for each fetch, with the agent and the provider", async () => {
  const events = [];
  let n = 0;
  const call = async (body, { fetchImpl }) => {
    const first = await fetchImpl("https://api.example.com/v1/messages", { method: "POST", headers: { "x-api-key": KEY }, body: JSON.stringify(body) });
    if (first.status === 429) await fetchImpl("https://api.example.com/v1/messages", { method: "POST", headers: { "x-api-key": KEY }, body: JSON.stringify(body) });
    return { ok: true };
  };
  const base = async () => (++n === 1 ? jsonResponse(429, { error: "slow" }, { "retry-after": "2" }) : jsonResponse(200, reply));
  const wrapped = loggedCall(call, { agent: "planner", provider: "anthropic", emit: (e) => events.push(e), baseFetch: base });
  assert.deepEqual(await wrapped({ model: "m" }, {}), { ok: true });
  assert.deepEqual(events.map((e) => [e.type, e.agent, e.provider, e.n, e.response.status]), [
    ["api_call", "planner", "anthropic", 1, 429],
    ["api_call", "planner", "anthropic", 2, 200],
  ]);
  assert.equal(events[0].response.headers["retry-after"], "2");
  assert.equal(events[0].request.headers["x-api-key"], "(hidden)");
});

test("loggedCall emits the entries also when the call throws", async () => {
  const events = [];
  const call = async (_body, { fetchImpl }) => {
    await fetchImpl("https://api.example.com/v1/messages", { method: "POST", body: "{}" });
    throw new Error("the provider failed");
  };
  const wrapped = loggedCall(call, { agent: "a", provider: "google", emit: (e) => events.push(e), baseFetch: async () => jsonResponse(500, { error: "x" }) });
  await assert.rejects(() => wrapped({}, {}), /the provider failed/);
  assert.equal(events.length, 1);
  assert.equal(events[0].response.status, 500);
});

test("a call that never reached fetch (a mock) emits nothing", async () => {
  const events = [];
  const wrapped = loggedCall(async () => ({ ok: 1 }), { agent: "a", provider: "anthropic", emit: (e) => events.push(e) });
  await wrapped({}, {});
  assert.deepEqual(events, []);
});

// --- through the real run handler and the real Anthropic adapter, with a stubbed global fetch ---

const design = () => ({ pattern: "sequential", nodes: [{ id: "planner", agent: "planner", model: "fast", search: false }, { id: "writer", agent: "writer", model: "fast", search: false }], edges: [{ from: "planner", to: "writer" }] });
function fakeRes() {
  return { statusCode: 0, chunks: [], setHeader() {}, flushHeaders() {}, write(c) { this.chunks.push(String(c)); return true; }, end(c) { if (c) this.chunks.push(String(c)); }, on() {}, get text() { return this.chunks.join(""); } };
}
const events = (res) => res.text.split("\n\n").filter((b) => b.startsWith("data: ")).map((b) => JSON.parse(b.slice(6)));
async function runWith(stub, extra = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    const handler = createRunHandler({ rateLimitImpl: () => true, env: {} });
    const res = fakeRes();
    await handler({ method: "POST", headers: {}, body: { design: design(), task: "Why is the sky blue?", limits: {}, language: "en", apiKey: KEY, retries: 0, ...extra } }, res);
    return res;
  } finally {
    globalThis.fetch = original;
  }
}

test("a run through the handler records each agent's call with its own number", async () => {
  const res = await runWith(async () => jsonResponse(200, reply, { "request-id": "req_1" }));
  const calls = events(res).filter((e) => e.type === "api_call");
  assert.deepEqual(calls.map((e) => [e.agent, e.n, e.provider]), [["planner", 1, "anthropic"], ["writer", 1, "anthropic"]]);
  assert.equal(calls[0].request.headers["x-api-key"], "(hidden)");
  assert.match(calls[0].request.body, /"model":"claude-haiku-5-5"/);
  assert.equal(calls[0].response.headers["request-id"], "req_1");
});

test("the key never appears in an api_call event, whatever the provider echoes", async () => {
  const echo = async (url, init) => {
    if (init?.signal?.aborted) throw new Error("aborted");
    return new Response(JSON.stringify({ error: { message: `bad key ${KEY}` } }), { status: 401, headers: { "content-type": "application/json", "x-echo": KEY, "x-debug-url": `https://x.test/?key=${KEY}` } });
  };
  const res = await runWith(echo);
  assert.ok(events(res).some((e) => e.type === "api_call"));
  assert.ok(!res.text.includes(KEY), "the key is in the stream");
  const thrown = await runWith(async () => { throw new TypeError(`network failed for ${KEY}`); });
  assert.ok(events(thrown).some((e) => e.type === "api_call" && e.response === null));
  assert.ok(!thrown.text.includes(KEY), "the key is in the stream (thrown)");
});

test("a failed call is recorded, and the run still reports its error", async () => {
  const res = await runWith(async () => jsonResponse(429, { error: { message: "slow down" } }, { "retry-after": "1" }));
  const failed = events(res).filter((e) => e.type === "api_call" && e.response?.status === 429);
  assert.ok(failed.length >= 1);
  assert.equal(failed[0].response.headers["retry-after"], "1");
});

test("the orchestrator gives every agent a logged call", () => {
  const source = readFileSync(new URL("../public/js/engine/orchestrator.js", import.meta.url), "utf8");
  const creations = [...source.matchAll(/createAgent\(\{[^}]*?call: ([^,]+),/g)].map((m) => m[1]);
  assert.ok(creations.length >= 1);
  for (const c of creations) assert.match(c, /loggedCall\(/, `createAgent gets ${c}`);
});

test("the run handler forwards the recording fetch to the provider call", () => {
  const source = readFileSync(new URL("../lib/run-handler.js", import.meta.url), "utf8");
  assert.match(source, /fetchImpl/);
});

test("the call number of an agent continues across its calls (rounds and retries)", async () => {
  const events = [];
  const wrapped = loggedCall(async (_b, { fetchImpl }) => fetchImpl("https://x.test/", { method: "POST", body: "{}" }), { agent: "planner", provider: "anthropic", emit: (e) => events.push(e), baseFetch: async () => jsonResponse(200, reply) });
  await wrapped({}, {});
  await wrapped({}, {});
  await wrapped({}, {});
  assert.deepEqual(events.map((e) => e.n), [1, 2, 3]);
});

test("a call cancelled because a sibling agent failed is recorded before done", async () => {
  const par = { pattern: "parallel", nodes: [{ id: "researcher", agent: "researcher", model: "fast", search: false }, { id: "critic", agent: "critic", model: "fast", search: false }, { id: "combiner", agent: "combiner", model: "fast", search: false }], edges: [{ from: "researcher", to: "combiner" }, { from: "critic", to: "combiner" }] };
  const stub = (_url, init) => {
    const body = JSON.parse(init.body);
    if (/Role: researcher/.test(body.system)) return Promise.resolve(new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 }));
    return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
  };
  const original = globalThis.fetch;
  globalThis.fetch = stub;
  const res = fakeRes();
  try {
    await createRunHandler({ rateLimitImpl: () => true, env: {} })({ method: "POST", headers: {}, body: { design: par, task: "t", limits: {}, language: "en", apiKey: KEY, retries: 0 } }, res);
  } finally {
    globalThis.fetch = original;
  }
  const all = events(res);
  const doneAt = all.findIndex((e) => e.type === "done");
  const cancelled = all.findIndex((e) => e.type === "api_call" && e.error === "cancelled");
  assert.ok(doneAt >= 0 && cancelled >= 0, "both exist");
  assert.ok(cancelled < doneAt, "the cancelled call is recorded before done");
});
