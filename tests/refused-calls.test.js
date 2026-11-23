import { test } from "node:test";
import assert from "node:assert/strict";
import { buildStatistics } from "../public/js/play-model.js";

const call = (agent, response, error = null) => ({ type: "api_call", agent, t: 1, n: 1, method: "POST", url: "x", request: { headers: {}, body: "" }, response, error, ms: 5 });
const run = (apiCalls) => ({
  schemaVersion: 1, id: "r", title: "T", language: "en", pattern: "sequential", appVersion: "1", recordedWith: { provider: "openrouter", model: "m" },
  design: { pattern: "sequential", nodes: [{ id: "a", agent: "planner", model: "fast", search: false }], edges: [] },
  events: [{ type: "run_start", t: 0 }, { type: "agent_start", t: 1, agent: "a" }, { type: "done", t: 2, outcome: "interrupted", usage: { input: 0, output: 0, searches: 0, steps: 0 } }],
  apiCalls,
});

test("statistics count the calls the provider refused, in all and per agent", () => {
  const stats = buildStatistics(run([call("a", { status: 429, headers: {}, body: "" }), call("a", { status: 200, headers: {}, body: "" }), call("a", null, "network")]));
  assert.equal(stats.refusedCalls, 2);
  assert.equal(stats.perAgent.find((x) => x.agent === "a").refused, 2);
});

test("a run without a log of calls has no refused calls", () => {
  const stats = buildStatistics(run(undefined));
  assert.equal(stats.refusedCalls, 0);
});
