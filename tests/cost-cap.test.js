import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COST_CAP_USD, clampCostCap, LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { clampLimits } from "../public/js/engine/patterns.js";
import { usageCostUsd } from "../public/js/engine/cost.js";
import { createBudget, LimitError } from "../public/js/engine/budget.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { limitMessage } from "../public/js/engine/harness.js";
import { limitWarning } from "../public/js/engine/estimate.js";
import { buildRunRecord } from "../public/js/engine/run-record.js";
import { buildStatistics, limitRows } from "../public/js/play-model.js";

const text = (t, input = 1000, output = 1000) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: input, output_tokens: output } });
const seq = (n, extra = {}) => ({
  pattern: "sequential",
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, agent: "planner", model: "strong", search: false, ...extra })),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
});

test("the cost cap is off by default and clipped to 0.10 to 5.00 when set", () => {
  assert.equal(clampCostCap(undefined), 0);
  assert.equal(clampCostCap(0), 0);
  assert.equal(clampCostCap(-3), 0);
  assert.equal(clampCostCap("x"), 0);
  assert.equal(clampCostCap(0.01), COST_CAP_USD.min);
  assert.equal(clampCostCap(99), COST_CAP_USD.max);
  assert.equal(clampCostCap(1.234), 1.23);
});

test("clampLimits keeps the cost cap only when it is set, so the old shape is unchanged", () => {
  assert.deepEqual(clampLimits({}), LIMIT_DEFAULTS);
  assert.deepEqual(clampLimits({ maxCostUsd: 0 }), LIMIT_DEFAULTS);
  assert.deepEqual(clampLimits({ maxCostUsd: 2 }), { ...LIMIT_DEFAULTS, maxCostUsd: 2 });
  assert.equal(clampLimits({ maxCostUsd: 500 }).maxCostUsd, 5);
});

test("the cost of a call follows the catalog prices and is zero on a free slot or free tier", () => {
  const strong = { id: "a", model: "strong" };
  assert.ok(Math.abs(usageCostUsd({ input: 1e6, output: 1e6, searches: 2 }, strong) - (5 + 25 + 0.02)) < 1e-9);
  assert.equal(usageCostUsd({ input: 1e6, output: 1e6 }, { id: "a", model: "fast", slot: "google-free" }, { provider: "google" }), 0);
  assert.equal(usageCostUsd({ input: 1e6, output: 1e6 }, { id: "a", model: "fast" }, { provider: "google", freeTier: true }), 0);
  assert.ok(usageCostUsd({ input: 1e6, output: 0 }, { id: "a", model: "fast", slot: "google" }, { provider: "google" }) > 0);
  assert.equal(usageCostUsd({}, strong), 0);
});

test("the budget stops a run whose cost passes the cap, and does nothing when there is no cap", () => {
  const capped = createBudget({ ...LIMIT_DEFAULTS, maxCostUsd: 1 });
  capped.chargeUsage({ cost: 0.6 });
  assert.throws(() => capped.chargeUsage({ cost: 0.6 }), (e) => e instanceof LimitError && e.reason === "cost");
  const free = createBudget(LIMIT_DEFAULTS);
  free.chargeUsage({ cost: 100 });
  assert.equal(free.spentUsd(), 100);
});

test("a run stops with the reason cost and a message that names the cap", async () => {
  const events = [];
  const result = await runDesign({
    design: seq(3),
    task: "t",
    limits: { ...LIMIT_DEFAULTS, maxCostUsd: 0.1 },
    call: async () => text("x", 10000, 2000),
    emit: (e) => events.push(e),
  });
  assert.equal(result.outcome, "stopped_limit");
  const warning = events.find((e) => e.type === "warning" && e.limit === "cost");
  assert.ok(warning);
  assert.match(warning.message, /\$0\.10/);
  assert.equal(events.filter((e) => e.type === "agent_output").length, 1);
});

test("a run on a free tier is never stopped by the cost cap", async () => {
  const result = await runDesign({
    design: seq(3),
    task: "t",
    limits: { ...LIMIT_DEFAULTS, maxCostUsd: 0.1 },
    freeTier: true,
    call: async () => text("x", 10000, 2000),
    emit: () => {},
  });
  assert.equal(result.outcome, "finished");
});

test("limitMessage words the cost reason", () => {
  assert.match(limitMessage("cost", { maxCostUsd: 1 }), /cost of the run \(\$1\.00/);
});

test("the warning before a run fires only when the design needs more than the limits give", () => {
  assert.equal(limitWarning(seq(3), LIMIT_DEFAULTS), null);
  const w = limitWarning(seq(8), { ...LIMIT_DEFAULTS, maxTokens: 10000 });
  assert.equal(w.turns, 8);
  assert.equal(w.tokens, 24000);
  assert.equal(w.tokensOver, true);
  assert.equal(w.steps, false);
  const debate = { pattern: "debate", rounds: 10, nodes: [{ id: "a", agent: "debater", model: "fast", search: false }, { id: "b", agent: "debater", model: "fast", search: false }, { id: "j", agent: "judge", model: "fast", search: false }], edges: [] };
  assert.equal(limitWarning(debate, LIMIT_DEFAULTS).steps, true);
});

test("the limits table gets a cost cell only when a cost cap was set, and marks it when it stopped the run", async () => {
  const events = [];
  const limits = { ...LIMIT_DEFAULTS, maxCostUsd: 0.1 };
  const design = seq(3);
  await runDesign({ design, task: "t", limits, call: async () => text("x", 10000, 2000), emit: (e) => events.push(e) });
  const run = buildRunRecord({ id: "r", design, task: "t", events, limits, language: "en", appVersion: "1", provider: "anthropic" });
  const cell = limitRows(buildStatistics(run))[0].cells.cost;
  assert.equal(cell.limit, 0.1);
  assert.equal(cell.hit, true);
  assert.ok(cell.used > 0);
  const plain = buildRunRecord({ id: "r2", design, task: "t", events, limits: LIMIT_DEFAULTS, language: "en", appVersion: "1", provider: "anthropic" });
  assert.equal(limitRows(buildStatistics(plain))[0].cells.cost, undefined);
});

test("the cost cap texts exist in both languages", () => {
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  for (const k of ["harness.costHeading", "harness.costIntro", "harness.costOff", "harness.limit.cost.label", "harness.limit.cost.hint", "harness.costNote", "create.limitWarning.title", "create.limitWarning.body", "create.limitWarning.link", "stats.limits.cost", "run.outcome.stopped_limit.cost"]) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
  }
});
