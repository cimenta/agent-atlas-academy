import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryBackend, createRunStore } from "../public/js/storage/runs-store.js";
import { API_LOG_BODY_MAX } from "../public/js/engine/api-log.js";

const sample = () => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample-run.json"), "utf8"));
const bigCall = (agent, n) => ({
  type: "api_call", agent, provider: "anthropic", n, t: 1, method: "POST", url: "https://api.anthropic.com/v1/messages",
  request: { headers: {}, body: "x".repeat(API_LOG_BODY_MAX) },
  response: { status: 200, statusText: "OK", headers: {}, body: "y".repeat(API_LOG_BODY_MAX) },
  error: null, ms: 1, truncated: { request: null, response: null },
});

test("a run whose log makes it too large is still saved, without the log, and says so", async () => {
  const run = sample();
  const agent = run.events.find((e) => e.type === "agent_start").agent;
  run.apiCalls = Array.from({ length: 5 }, (_, i) => ({ ...bigCall(agent, i + 1), response: { ...bigCall(agent, 1).response, status: 500 } }));
  const store = createRunStore(createMemoryBackend());
  assert.deepEqual(await store.save(run), { ok: true });
  const saved = await store.get(run.id);
  assert.equal("apiCalls" in saved, false);
  assert.equal(saved.apiCallsDropped, true);
  assert.equal(saved.events.length, run.events.length);
});

test("a run that fits keeps its log", async () => {
  const run = sample();
  const agent = run.events.find((e) => e.type === "agent_start").agent;
  run.apiCalls = [{ ...bigCall(agent, 1), request: { headers: {}, body: "{}" }, response: { status: 200, statusText: "OK", headers: {}, body: "{}" } }];
  const store = createRunStore(createMemoryBackend());
  assert.deepEqual(await store.save(run), { ok: true });
  assert.equal((await store.get(run.id)).apiCalls.length, 1);
});

test("a run that is too large even without the log is still refused", async () => {
  const run = sample();
  run.about = { description: "z".repeat(10) };
  run.events[1] = { ...run.events[1], padding: "p".repeat(2 * 1024 * 1024 + 10) };
  run.apiCalls = [];
  const store = createRunStore(createMemoryBackend());
  assert.deepEqual(await store.save(run), { ok: false, reason: "too_large" });
});

test("a run whose log is not valid is saved without the log instead of being lost", async () => {
  const run = sample();
  const agent = run.events.find((e) => e.type === "agent_start").agent;
  run.apiCalls = [{ ...bigCall(agent, 1), request: { headers: { "x-long": "h".repeat(5000) }, body: "{}" }, response: null, error: "e" }];
  const store = createRunStore(createMemoryBackend());
  assert.deepEqual(await store.save(run), { ok: true });
  const saved = await store.get(run.id);
  assert.equal("apiCalls" in saved, false);
  assert.equal(saved.apiCallsDropped, true);
});

test("a run that is invalid for another reason is still refused", async () => {
  const run = sample();
  run.pattern = "";
  run.apiCalls = [];
  const store = createRunStore(createMemoryBackend());
  assert.deepEqual(await store.save(run), { ok: false, reason: "invalid" });
});

test("over the cap, the bodies of the calls that worked go first, and the failures stay readable", async () => {
  const run = sample();
  const agent = run.events.find((e) => e.type === "agent_start").agent;
  const failed = { ...bigCall(agent, 3), request: { headers: {}, body: "{}" }, response: { status: 429, statusText: "x", headers: { "retry-after": "2" }, body: '{"error":"slow"}' } };
  run.apiCalls = [bigCall(agent, 1), bigCall(agent, 2), failed, bigCall(agent, 4), bigCall(agent, 5)];
  const store = createRunStore(createMemoryBackend());
  assert.deepEqual(await store.save(run), { ok: true });
  const saved = await store.get(run.id);
  assert.equal(saved.apiCalls.length, 5);
  assert.equal(saved.apiCalls[2].response.body, '{"error":"slow"}');
  assert.equal(saved.apiCalls[0].request.body, "");
  assert.equal(saved.apiCalls[0].truncated.request, API_LOG_BODY_MAX);
  assert.equal("apiCallsDropped" in saved, false);
});

test("a carried-on run keeps the note that the earlier calls were dropped", async () => {
  const { buildRunRecord } = await import("../public/js/engine/run-record.js");
  const base = { id: "local-1", design: { pattern: "sequential", nodes: [{ id: "a", agent: "planner", model: "fast" }], edges: [] }, task: "t", events: [{ t: 0, type: "run_start" }], limits: {}, language: "en", appVersion: "1" };
  assert.equal(buildRunRecord({ ...base, apiCallsDropped: true }).apiCallsDropped, true);
  assert.equal("apiCallsDropped" in buildRunRecord(base), false);
});
