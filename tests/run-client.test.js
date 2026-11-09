import { test } from "node:test";
import assert from "node:assert/strict";
import { startRun, RunStartError } from "../public/js/run-client.js";

const enc = new TextEncoder();

function streamOf(chunks, { hang = false, signal } = {}) {
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(enc.encode(c));
      if (hang) {
        signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      } else {
        controller.close();
      }
    },
  });
}

const sse = (event) => `data: ${JSON.stringify(event)}\n\n`;
const params = (extra = {}) => ({
  design: { pattern: "sequential", nodes: [], edges: [] },
  task: "t",
  limits: {},
  language: "en",
  apiKey: "sk-ant-secretsecretsecretsecret",
  ...extra,
});

function okFetch(chunks, opts = {}) {
  const calls = [];
  const fetchFn = async (url, init) => {
    calls.push({ url, init });
    return new Response(streamOf(chunks, { ...opts, signal: init.signal }), { status: 200, headers: { "content-type": "text/event-stream" } });
  };
  fetchFn.calls = calls;
  return fetchFn;
}

test("events arrive in order and done resolves with the outcome", async () => {
  const got = [];
  const fetchFn = okFetch([sse({ type: "run_start", t: 0 }), sse({ type: "agent_start", agent: "a", t: 1 }), sse({ type: "done", outcome: "finished", usage: {}, t: 2 })]);
  const run = startRun({ ...params(), fetchFn, onEvent: (e) => got.push(e) });
  const result = await run.done;
  assert.deepEqual(got.map((e) => e.type), ["run_start", "agent_start", "done"]);
  assert.equal(result.outcome, "finished");
});

test("an event split across two chunks is delivered once", async () => {
  const text = sse({ type: "agent_start", agent: "a", t: 1 });
  const got = [];
  const fetchFn = okFetch([sse({ type: "run_start", t: 0 }), text.slice(0, 15), text.slice(15), sse({ type: "done", outcome: "finished", usage: {}, t: 2 })]);
  await startRun({ ...params(), fetchFn, onEvent: (e) => got.push(e) }).done;
  assert.equal(got.filter((e) => e.type === "agent_start").length, 1);
});

test("comment lines and garbage lines are skipped", async () => {
  const got = [];
  const fetchFn = okFetch([": ping\n\n", "data: not json\n\n", sse({ type: "run_start", t: 0 }), "garbage line\n\n", sse({ type: "done", outcome: "finished", usage: {}, t: 1 })]);
  await startRun({ ...params(), fetchFn, onEvent: (e) => got.push(e) }).done;
  assert.deepEqual(got.map((e) => e.type), ["run_start", "done"]);
});

test("a stream that ends without done gets a synthesized interrupted done with summed usage", async () => {
  const got = [];
  const fetchFn = okFetch([
    sse({ type: "run_start", t: 0 }),
    sse({ type: "agent_output", agent: "a", text: "x", tokens: { input: 10, output: 5 }, t: 7 }),
    sse({ type: "agent_output", agent: "b", text: "y", tokens: { input: 20, output: 6 }, t: 9 }),
  ]);
  const result = await startRun({ ...params(), fetchFn, onEvent: (e) => got.push(e) }).done;
  const last = got.at(-1);
  assert.equal(result.outcome, "interrupted");
  assert.equal(last.type, "done");
  assert.equal(last.outcome, "interrupted");
  assert.equal(last.t, 9);
  assert.deepEqual([last.usage.input, last.usage.output], [30, 11]);
});

test("stop() aborts the fetch and ends with a stopped_user done", async () => {
  const got = [];
  const fetchFn = okFetch([sse({ type: "run_start", t: 0 })], { hang: true });
  const run = startRun({ ...params(), fetchFn, onEvent: (e) => got.push(e) });
  await new Promise((r) => setTimeout(r, 10));
  run.stop();
  const result = await run.done;
  assert.equal(fetchFn.calls[0].init.signal.aborted, true);
  assert.equal(result.outcome, "stopped_user");
  assert.equal(got.at(-1).type, "done");
  assert.equal(got.at(-1).outcome, "stopped_user");
});

test("a 429 response rejects with RunStartError rate_limit", async () => {
  const fetchFn = async () => new Response(JSON.stringify({ error: "rate_limit" }), { status: 429 });
  await assert.rejects(startRun({ ...params(), fetchFn, onEvent() {} }).done, (e) => e instanceof RunStartError && e.code === "rate_limit");
});

test("a 400 bad_design carries the errors", async () => {
  const errors = [{ code: "node.count" }];
  const fetchFn = async () => new Response(JSON.stringify({ error: "bad_design", errors }), { status: 400 });
  await assert.rejects(startRun({ ...params(), fetchFn, onEvent() {} }).done, (e) => e.code === "bad_design" && e.errors[0].code === "node.count");
});

test("a failed network call or a non-JSON error becomes a RunStartError", async () => {
  await assert.rejects(startRun({ ...params(), fetchFn: async () => { throw new TypeError("offline"); }, onEvent() {} }).done, (e) => e instanceof RunStartError && e.code === "network");
  await assert.rejects(startRun({ ...params(), fetchFn: async () => new Response("<html>", { status: 502 }), onEvent() {} }).done, (e) => e instanceof RunStartError && e.code === "server");
});

test("the key is only in the request body and the URL is exactly /api/run", async () => {
  const fetchFn = okFetch([sse({ type: "done", outcome: "finished", usage: {}, t: 0 })]);
  await startRun({ ...params(), fetchFn, onEvent() {} }).done;
  const { url, init } = fetchFn.calls[0];
  assert.equal(url, "/api/run");
  assert.equal(init.method, "POST");
  assert.ok(JSON.parse(init.body).apiKey.startsWith("sk-ant-"));
  assert.ok(!JSON.stringify(init.headers).includes("sk-ant"));
});
