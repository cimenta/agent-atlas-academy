import { test } from "node:test";
import assert from "node:assert/strict";
import { activationsOf, estimateRun } from "../public/js/engine/estimate.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const supervisor = (creates) => ({ pattern: "supervisor", nodes: [node("boss", "supervisor", creates ? { creates } : {}), node("r", "researcher"), node("w", "writer")], edges: [{ from: "boss", to: "r" }, { from: "boss", to: "w" }] });
const limits = { ...LIMIT_DEFAULTS, maxSteps: 60 };

test("a supervisor that may create agents is estimated with every allowed agent used", () => {
  assert.equal(activationsOf(supervisor(null), limits), 2 * 2 + 2);
  assert.equal(activationsOf(supervisor({ max: 3, guidance: "", search: false }), limits), 2 * 5 + 2);
});

test("the step limit still caps the estimate", () => {
  assert.equal(activationsOf(supervisor({ max: 4, guidance: "", search: false }), { ...LIMIT_DEFAULTS, maxSteps: 10 }), 10);
});

test("a planner that may create agents is estimated as before", () => {
  const plain = { pattern: "planexec", nodes: [node("p", "planner"), node("e", "executor")], edges: [{ from: "p", to: "e" }] };
  const creating = { ...plain, nodes: [node("p", "planner", { creates: { max: 2, guidance: "", search: false } }), node("e", "executor")] };
  assert.equal(activationsOf(creating, limits), activationsOf(plain, limits));
});

test("the cost of a design that may create agents grows with the cap", () => {
  const small = estimateRun(supervisor({ max: 1, guidance: "", search: false }), LIMIT_DEFAULTS);
  const big = estimateRun(supervisor({ max: 4, guidance: "", search: false }), LIMIT_DEFAULTS);
  assert.ok(big.activations > small.activations);
  assert.ok(big.totalUsd >= small.totalUsd);
});

test("created agents that may search are counted as searchers", () => {
  const without = estimateRun(supervisor({ max: 2, guidance: "", search: false }), LIMIT_DEFAULTS);
  const withSearch = estimateRun(supervisor({ max: 2, guidance: "", search: true }), LIMIT_DEFAULTS);
  assert.equal(without.searchCostUsd, 0);
  assert.ok(withSearch.searchCostUsd > 0);
});
