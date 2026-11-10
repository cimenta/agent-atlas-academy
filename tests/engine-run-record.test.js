import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRunRecord, titleFromTask, makeRunId } from "../public/js/engine/run-record.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { validateRun } from "../public/js/run-schema.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const edge = (from, to) => ({ from, to });

const designs = {
  sequential: {
    pattern: "sequential",
    nodes: [node("planner", "planner"), node("researcher", "researcher", { search: true }), node("critic", "critic"), node("writer", "writer")],
    edges: [edge("planner", "researcher"), edge("researcher", "critic"), edge("critic", "writer")],
  },
  parallel: {
    pattern: "parallel",
    nodes: [node("researcher", "researcher", { search: true }), node("researcher-2", "researcher"), node("combiner", "combiner")],
    edges: [edge("researcher", "combiner"), edge("researcher-2", "combiner")],
  },
  supervisor: {
    pattern: "supervisor",
    nodes: [node("supervisor", "supervisor"), node("researcher", "researcher"), node("writer", "writer")],
    edges: [edge("supervisor", "researcher"), edge("supervisor", "writer")],
  },
  debate: {
    pattern: "debate",
    nodes: [node("debater", "debater", { stance: "for" }), node("debater-2", "debater", { stance: "against" }), node("judge", "judge")],
    edges: [edge("debater", "judge"), edge("debater-2", "judge")],
    rounds: 2,
  },
};

async function record(pattern, extra = {}) {
  const events = [];
  await runDesign({ design: designs[pattern], task: "Why is the sky blue?", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  return buildRunRecord({
    id: "local-test-1",
    design: designs[pattern],
    task: "Why is the sky blue?",
    events,
    limits: LIMIT_DEFAULTS,
    language: "en",
    appVersion: "0.3.0",
    ...extra,
  });
}

for (const pattern of Object.keys(designs)) {
  test(`a ${pattern} mock run becomes a valid v1 run record`, async () => {
    const run = await record(pattern);
    const result = validateRun(run);
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
    assert.equal(run.outcome, "finished");
    assert.equal(run.pattern, pattern);
    assert.equal(run.source, "local");
    assert.equal(run.recordedWith.provider, "anthropic");
    assert.equal(run.recordedWith.model, "claude-haiku-5-5");
    assert.deepEqual(run.design, designs[pattern]);
    assert.ok(run.usage.input > 0);
  });
}

test("a record built from events without a done event is interrupted, with summed usage", () => {
  const events = [
    { t: 0, type: "run_start", task: "x", pattern: "sequential" },
    { t: 5, type: "agent_start", agent: "planner", role: "Planner" },
    { t: 9, type: "agent_output", agent: "planner", text: "plan", tokens: { input: 100, output: 20 } },
    { t: 10, type: "agent_start", agent: "writer", role: "Writer" },
    { t: 12, type: "tool_call", agent: "writer", tool: "web_search", input: "q" },
    { t: 15, type: "agent_output", agent: "writer", text: "w", tokens: { input: 50, output: 10 } },
  ];
  const run = buildRunRecord({ id: "local-x", design: designs.sequential, task: "x", events, limits: LIMIT_DEFAULTS, language: "en", appVersion: "0.3.0" });
  assert.equal(run.outcome, "interrupted");
  assert.deepEqual([run.usage.input, run.usage.output, run.usage.searches], [150, 30, 1]);
  assert.equal(validateRun(run).ok, true);
});

test("titleFromTask uses the first line and cuts at 60 characters", () => {
  assert.equal(titleFromTask("  Short task  "), "Short task");
  assert.equal(titleFromTask("first line\nsecond line"), "first line");
  const cut = titleFromTask("x".repeat(200));
  assert.equal(cut.length, 61);
  assert.ok(cut.endsWith("…"));
  assert.equal(titleFromTask(""), "Untitled run");
});

test("makeRunId is slug-shaped and varies with the random part", () => {
  const a = makeRunId(1700000000000, () => 0.123456);
  const b = makeRunId(1700000000000, () => 0.654321);
  assert.match(a, /^[a-z0-9-]+$/);
  assert.ok(a.startsWith("local-"));
  assert.notEqual(a, b);
});

test("nothing but the named fields ends up in the record, so a key cannot ride along", async () => {
  const run = await record("sequential", { apiKey: "sk-ant-api03-SECRETSECRET", extra: { password: "hunter2" } });
  const json = JSON.stringify(run);
  assert.ok(!json.includes("SECRETSECRET"));
  assert.ok(!json.includes("hunter2"));
});

test("a run record keeps when it started and ended and the client details when they are given", () => {
  const design = { pattern: "sequential", nodes: [{ id: "planner", agent: "planner", model: "fast", search: false }], edges: [] };
  const rec = buildRunRecord({ id: "local-x", design, task: "t", events: [], limits: {}, language: "en", appVersion: "1", startedAt: Date.UTC(2026, 10, 10, 8, 0, 0), endedAt: Date.UTC(2026, 10, 10, 8, 1, 28), client: { timezone: "Europe/Prague" } });
  assert.equal(rec.startedAt, "2026-11-10T08:00:00.000Z");
  assert.equal(rec.endedAt, "2026-11-10T08:01:28.000Z");
  assert.equal(rec.durationMs, 88000);
  assert.deepEqual(rec.client, { timezone: "Europe/Prague" });
  const bare = buildRunRecord({ id: "local-y", design, task: "t", events: [], limits: {}, language: "en", appVersion: "1" });
  assert.ok(!("startedAt" in bare) && !("client" in bare));
});
