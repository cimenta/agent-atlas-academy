import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRunHandler } from "../lib/run-handler.js";
import { rateLimit } from "../lib/rate-limit.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";

const KEY = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX";
const design = () => ({
  pattern: "sequential",
  nodes: [
    { id: "planner", agent: "planner", model: "fast", search: false },
    { id: "writer", agent: "writer", model: "fast", search: false },
  ],
  edges: [{ from: "planner", to: "writer" }],
});
const goodBody = (extra = {}) => ({ design: design(), task: "Why is the sky blue?", limits: {}, language: "en", apiKey: KEY, ...extra });

function fakeReq(body, { method = "POST", ip = "1.1.1.1" } = {}) {
  return { method, headers: { "x-forwarded-for": `${ip}, 10.0.0.1` }, body };
}

function fakeRes() {
  const listeners = {};
  const res = {
    statusCode: 0,
    headers: {},
    chunks: [],
    ended: false,
    setHeader(k, v) {
      this.headers[k.toLowerCase()] = v;
    },
    flushHeaders() {},
    write(chunk) {
      if (this.ended) throw new Error("write after end");
      this.chunks.push(String(chunk));
      return true;
    },
    end(chunk) {
      if (chunk) this.chunks.push(String(chunk));
      this.ended = true;
      listeners.close?.forEach((f) => f());
    },
    on(name, fn) {
      (listeners[name] ??= []).push(fn);
    },
    emit(name) {
      listeners[name]?.forEach((f) => f());
    },
    get text() {
      return this.chunks.join("");
    },
    get json() {
      return JSON.parse(this.text);
    },
  };
  return res;
}

const sseEvents = (res) =>
  res.text
    .split("\n\n")
    .filter((b) => b.startsWith("data: "))
    .map((b) => JSON.parse(b.slice(6)));

function handler(opts = {}) {
  return createRunHandler({ call: createMockCall(), rateLimitImpl: () => true, env: {}, ...opts });
}

async function send(h, body, reqOpts) {
  const res = fakeRes();
  await h(fakeReq(body, reqOpts), res);
  return res;
}

test("a wrong method gets 405", async () => {
  const res = await send(handler(), goodBody(), { method: "GET" });
  assert.equal(res.statusCode, 405);
  assert.equal(res.json.error, "method");
});

test("a body that is not JSON gets 400 bad_json", async () => {
  const res = await send(handler(), "{not json");
  assert.equal(res.statusCode, 400);
  assert.equal(res.json.error, "bad_json");
});

test("a body over 65536 bytes gets 413 too_large", async () => {
  const res = await send(handler(), JSON.stringify(goodBody({ pad: "x".repeat(70000) })));
  assert.equal(res.statusCode, 413);
  assert.equal(res.json.error, "too_large");
});

test("a missing or short key gets 400 bad_key", async () => {
  for (const apiKey of [undefined, "short", 12345, "k".repeat(301)]) {
    const res = await send(handler(), goodBody({ apiKey }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.error, "bad_key");
  }
});

test("an empty or overlong task gets 400 bad_task", async () => {
  for (const task of ["", "   ", "x".repeat(1001), 42]) {
    const res = await send(handler(), goodBody({ task }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.error, "bad_task");
  }
});

test("invalid designs get 400 bad_design and the provider is never called", async () => {
  let calls = 0;
  const h = handler({
    call: async () => {
      calls += 1;
    },
  });
  const many = {
    pattern: "sequential",
    nodes: Array.from({ length: 500 }, (_, i) => ({ id: `n${i}`, agent: "writer", model: "fast", search: false })),
    edges: [],
  };
  const cycle = { ...design(), edges: [{ from: "planner", to: "writer" }, { from: "writer", to: "planner" }] };
  const unknownModel = design();
  unknownModel.nodes[0].model = "huge";
  const wrongShape = { ...design(), pattern: "debate" };
  for (const bad of [many, cycle, unknownModel, wrongShape, null, "x"]) {
    const res = await send(h, goodBody({ design: bad }));
    assert.equal(res.statusCode, 400);
    assert.equal(res.json.error, "bad_design");
    assert.ok(Array.isArray(res.json.errors));
  }
  assert.equal(calls, 0);
});

test("a valid request streams events from run_start to done as server-sent events", async () => {
  const res = await send(handler(), goodBody());
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /text\/event-stream/);
  assert.equal(res.headers["cache-control"], "no-store, no-transform");
  assert.equal(res.headers["x-accel-buffering"], "no");
  const events = sseEvents(res);
  assert.equal(events[0].type, "run_start");
  assert.equal(events.at(-1).type, "done");
  assert.equal(events.at(-1).outcome, "finished");
  assert.equal(res.ended, true);
});

test("limits above the hard maximum are clamped", async () => {
  const big = async () => ({
    content: [{ type: "text", text: "ok" }],
    stop_reason: "end_turn",
    usage: { input_tokens: 90000, output_tokens: 90000 },
  });
  const res = await send(handler({ call: big }), goodBody({ limits: { maxTokens: 10_000_000, maxSteps: 10_000, maxSearches: 500 } }));
  const done = sseEvents(res).at(-1);
  assert.equal(done.outcome, "stopped_limit");
});

test("the key never appears in the response or in console output", async () => {
  const logged = [];
  const restores = ["log", "error", "warn", "info"].map((name) => {
    const original = console[name];
    console[name] = (...args) => logged.push(args.join(" "));
    return () => {
      console[name] = original;
    };
  });
  let res;
  try {
    const leaky = async () => {
      throw new Error(`boom with ${KEY} inside`);
    };
    res = await send(handler({ call: leaky }), goodBody());
  } finally {
    restores.forEach((restore) => restore());
  }
  assert.ok(!res.text.includes("ABCDEFGHIJKLMNOPQRSTUVWX"));
  assert.equal(sseEvents(res).at(-1).type, "done");
  assert.ok(!logged.join("\n").includes("ABCDEFGHIJKLMNOPQRSTUVWX"));
});

test("the key is passed to the provider call, not inside the request body", async () => {
  const seen = [];
  const spy = async (body, opts) => {
    seen.push({ body, opts });
    return createMockCall()(body, opts);
  };
  await send(handler({ call: spy }), goodBody());
  assert.ok(seen.length > 0);
  assert.equal(seen[0].opts.apiKey, KEY);
  assert.ok(!JSON.stringify(seen[0].body).includes(KEY));
});

test("closing the response mid-run aborts the signal and stops writes", async () => {
  let signalSeen;
  let release;
  const gate = new Promise((r) => {
    release = r;
  });
  const slow = async (body, opts) => {
    signalSeen = opts.signal;
    await gate;
    if (opts.signal.aborted) throw new Error("The request was cancelled");
    return createMockCall()(body, opts);
  };
  const res = fakeRes();
  const running = handler({ call: slow })(fakeReq(goodBody()), res);
  await new Promise((r) => setTimeout(r, 10));
  res.emit("close");
  assert.equal(signalSeen.aborted, true);
  const before = res.chunks.length;
  release();
  await running;
  assert.equal(res.chunks.length, before);
});

test("the 11th request from one address gets 429 rate_limit", async () => {
  const h = createRunHandler({ call: createMockCall(), rateLimitImpl: rateLimit, env: {} });
  let last;
  for (let i = 0; i < 11; i++) last = await send(h, goodBody(), { ip: "9.9.9.9" });
  assert.equal(last.statusCode, 429);
  assert.equal(last.json.error, "rate_limit");
  const other = await send(h, goodBody(), { ip: "8.8.8.8" });
  assert.equal(other.statusCode, 200);
});

test("RUNS_PER_HOUR overrides the default limit", async () => {
  const h = createRunHandler({ call: createMockCall(), rateLimitImpl: rateLimit, env: { RUNS_PER_HOUR: "1" } });
  const first = await send(h, goodBody(), { ip: "7.7.7.7" });
  const second = await send(h, goodBody(), { ip: "7.7.7.7" });
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 429);
});

test("vercel.json gives api/run.js five minutes", () => {
  const config = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(config.functions["api/run.js"].maxDuration, 300);
});
