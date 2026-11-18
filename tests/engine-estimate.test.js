import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateRun, activationsOf, TOKENS_PER_ACTIVATION } from "../public/js/engine/estimate.js";
import { LIMIT_DEFAULTS, PRICES_AS_OF } from "../public/js/engine/catalog.js";

const prices = {
  models: [
    { key: "fast", inputPerMTok: 1, outputPerMTok: 5 },
    { key: "balanced", inputPerMTok: 3, outputPerMTok: 15 },
    { key: "strong", inputPerMTok: 15, outputPerMTok: 75 },
  ],
  search: 0.01,
};
const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const chain = () => ({
  pattern: "sequential",
  nodes: [node("planner", "planner"), node("researcher", "researcher"), node("critic", "critic"), node("writer", "writer")],
  edges: [],
});

test("a four-agent chain on the fast model", () => {
  const est = estimateRun(chain(), LIMIT_DEFAULTS, prices);
  assert.equal(TOKENS_PER_ACTIVATION, 3000);
  assert.equal(est.activations, 4);
  assert.equal(est.tokensUpper, 12000);
  assert.equal(est.costUsd, (12000 / 2) * 1 / 1e6 + (12000 / 2) * 5 / 1e6);
  assert.equal(est.searchCostUsd, 0);
  assert.equal(est.totalUsd, est.costUsd + est.searchCostUsd);
  assert.equal(est.pricesAsOf, PRICES_AS_OF);
});

test("the most expensive model in the design sets the price", () => {
  const d = chain();
  d.nodes[3].model = "strong";
  const est = estimateRun(d, LIMIT_DEFAULTS, prices);
  assert.equal(est.costUsd, (12000 / 2) * 15 / 1e6 + (12000 / 2) * 75 / 1e6);
});

test("searches are priced only when some agent can search", () => {
  const d = chain();
  d.nodes[1].search = true;
  assert.equal(estimateRun(d, LIMIT_DEFAULTS, prices).searchCostUsd, 3 * 0.01);
  assert.equal(estimateRun(chain(), LIMIT_DEFAULTS, prices).searchCostUsd, 0);
});

test("activations per pattern", () => {
  const debate = {
    pattern: "debate",
    nodes: [node("debater", "debater"), node("debater-2", "debater"), node("judge", "judge")],
    edges: [],
    rounds: 3,
  };
  assert.equal(activationsOf(debate, LIMIT_DEFAULTS), 7);
  const sup = {
    pattern: "supervisor",
    nodes: [node("supervisor", "supervisor"), node("researcher", "researcher"), node("writer", "writer")],
    edges: [],
  };
  assert.equal(activationsOf(sup, LIMIT_DEFAULTS), 6);
  assert.equal(activationsOf(sup, { ...LIMIT_DEFAULTS, maxSteps: 4 }), 4);
  const par = { pattern: "parallel", nodes: [node("a", "researcher"), node("b", "researcher"), node("c", "combiner")], edges: [] };
  assert.equal(activationsOf(par, LIMIT_DEFAULTS), 3);
});

test("the token limit caps the upper bound", () => {
  const est = estimateRun(chain(), { ...LIMIT_DEFAULTS, maxTokens: 5000 }, prices);
  assert.equal(est.tokensUpper, 5000);
});

test("the default price table is used when none is given", () => {
  const est = estimateRun(chain(), LIMIT_DEFAULTS);
  assert.ok(est.totalUsd > 0);
});

// ---- evaluator loop ----
import { limitWarning, emptyCriteria } from "../public/js/engine/estimate.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { runDesign } from "../public/js/engine/orchestrator.js";

const evalDesign = (extra = {}) => ({
  pattern: "evaluator",
  nodes: [{ id: "writer", agent: "writer", model: "fast", search: false }, { id: "evaluator", agent: "evaluator", model: "fast", search: false }],
  edges: [{ from: "writer", to: "evaluator" }],
  rounds: 3,
  criteria: "Short.",
  ...extra,
});

test("activationsOf an evaluator design is two per round", () => {
  assert.equal(activationsOf(evalDesign(), LIMIT_DEFAULTS), 6);
  assert.equal(activationsOf(evalDesign({ rounds: 4 }), LIMIT_DEFAULTS), 8);
});

test("limitWarning flags an evaluator design that needs more steps than allowed", () => {
  assert.equal(limitWarning(evalDesign({ rounds: 4 }), { ...LIMIT_DEFAULTS, maxSteps: 6 }).steps, true);
  assert.equal(limitWarning(evalDesign({ rounds: 1 }), LIMIT_DEFAULTS), null);
});

test("emptyCriteria is true for empty, spaces and missing, only for the evaluator pattern", () => {
  assert.equal(emptyCriteria(evalDesign({ criteria: "" })), true);
  assert.equal(emptyCriteria(evalDesign({ criteria: "   " })), true);
  assert.equal(emptyCriteria(evalDesign({ criteria: undefined })), true);
  assert.equal(emptyCriteria(evalDesign()), false);
  assert.equal(emptyCriteria({ pattern: "debate", nodes: [], edges: [] }), false);
});

async function mockRun(options) {
  const events = [];
  const result = await runDesign({ design: evalDesign(), task: "Write it", limits: LIMIT_DEFAULTS, call: createMockCall(options), emit: (e) => events.push(e) });
  return { result, end: events.find((e) => e.type === "loop_end") };
}

test("the mock evaluator accepts at round 2 by default", async () => {
  const { result, end } = await mockRun({});
  assert.equal(result.outcome, "finished");
  assert.deepEqual({ r: end.result, n: end.round }, { r: "accepted", n: 2 });
});

test("the mock evaluator can be set to accept at round 1, 3, or never", async () => {
  assert.equal((await mockRun({ evaluatorAcceptsAt: 1 })).end.round, 1);
  assert.equal((await mockRun({ evaluatorAcceptsAt: 3 })).end.round, 3);
  const never = await mockRun({ evaluatorAcceptsAt: 0 });
  assert.deepEqual({ r: never.end.result, n: never.end.round }, { r: "not_accepted", n: 3 });
});
