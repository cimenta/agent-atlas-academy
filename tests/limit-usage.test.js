import { test } from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { buildRunRecord } from "../public/js/engine/run-record.js";
import { buildStatistics, limitRows } from "../public/js/play-model.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { TIME_LIMIT_MS } from "../public/js/engine/budget.js";
import { readFileSync } from "node:fs";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

const design = (planner = {}) => ({
  pattern: "sequential",
  nodes: [
    { id: "planner", agent: "planner", model: "fast", search: false, ...planner },
    { id: "writer", agent: "writer", model: "fast", search: false },
  ],
  edges: [{ from: "planner", to: "writer" }],
});

async function record(planner, limits = LIMIT_DEFAULTS, replies) {
  const events = [];
  let n = 0;
  const call = async () => replies[Math.min(n++, replies.length - 1)];
  await runDesign({ design: design(planner), task: "t", limits, call, emit: (e) => events.push(e) });
  return buildRunRecord({ id: "r1", design: design(planner), task: "t", events, limits, language: "en", appVersion: "1", provider: "anthropic" });
}
const text = (t, stop = "end_turn") => ({ content: [{ type: "text", text: t }], stop_reason: stop, usage: { input_tokens: 100, output_tokens: 50 } });

test("the statistics hold the limits of each agent and which it reached", async () => {
  const run = await record({ limits: { maxSteps: 1 }, onLimit: "pass" }, LIMIT_DEFAULTS, [text("part", "pause_turn"), text("done")]);
  const stats = buildStatistics(run);
  assert.deepEqual(stats.runLimits, LIMIT_DEFAULTS);
  const planner = stats.perAgent.find((a) => a.agent === "planner");
  assert.deepEqual(planner.limits, { maxSteps: 1 });
  assert.equal(planner.onLimit, "pass");
  assert.deepEqual(planner.hit, ["agent_steps"]);
  const writer = stats.perAgent.find((a) => a.agent === "writer");
  assert.equal(writer.limits, null);
  assert.deepEqual(writer.hit, []);
});

test("limitRows gives the run first, then each agent, with used, limit and where the limit comes from", async () => {
  const run = await record({ limits: { maxSteps: 1, maxTokens: 12000 }, onLimit: "pass" }, LIMIT_DEFAULTS, [text("part", "pause_turn"), text("done")]);
  const rows = limitRows(buildStatistics(run));
  assert.deepEqual(rows.map((r) => r.id), ["run", "planner", "writer"]);
  const [whole, planner, writer] = rows;
  assert.deepEqual(whole.cells.steps, { used: 2, limit: 20, from: "run", hit: false });
  assert.equal(whole.cells.time.limit, TIME_LIMIT_MS / 1000);
  assert.deepEqual(planner.cells.steps, { used: 1, limit: 1, from: "agent", hit: true });
  assert.deepEqual(planner.cells.tokens, { used: 150, limit: 12000, from: "agent", hit: false });
  assert.deepEqual(planner.cells.searches, { used: 0, limit: 3, from: "run", hit: false });
  assert.deepEqual(writer.cells.steps, { used: 1, limit: 20, from: "run", hit: false });
  assert.equal(planner.own, true);
  assert.equal(writer.own, false);
});

test("a run that stopped on a run limit marks that limit on the run row", async () => {
  const limits = { ...LIMIT_DEFAULTS, maxSteps: 1 };
  const run = await record({}, limits, [text("one"), text("two")]);
  const rows = limitRows(buildStatistics(run));
  assert.equal(rows[0].cells.steps.hit, true);
});

test("a run without recorded limits shows usage with no limit to compare to", () => {
  const rows = limitRows({ runLimits: null, calls: 1, usage: { input: 1, output: 1, searches: 0 }, totalMs: 1000, runHit: null, perAgent: [] });
  assert.equal(rows[0].cells.steps.limit, null);
});

test("every text of the limits table exists in both languages", () => {
  for (const key of ["stats.limits.title", "stats.limits.intro", "stats.limits.run", "stats.limits.agent", "stats.limits.steps", "stats.limits.tokens", "stats.limits.searches", "stats.limits.time", "stats.limits.ofRun", "stats.limits.ofAgent", "stats.limits.reached", "stats.limits.none"]) {
    assert.ok(en[key], `en ${key}`);
    assert.ok(cs[key], `cs ${key}`);
  }
});
