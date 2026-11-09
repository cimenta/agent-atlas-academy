import { test } from "node:test";
import assert from "node:assert/strict";
import { createBudget, LimitError, TIME_LIMIT_MS } from "../public/js/engine/budget.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const limitsOf = (over = {}) => ({ ...LIMIT_DEFAULTS, ...over });

test("the time limit is 270 seconds", () => {
  assert.equal(TIME_LIMIT_MS, 270000);
});

test("steps over the limit throw LimitError with reason steps", () => {
  const budget = createBudget(limitsOf({ maxSteps: 20 }));
  for (let i = 0; i < 20; i++) budget.chargeStep();
  assert.throws(() => budget.chargeStep(), (e) => e instanceof LimitError && e.reason === "steps");
});

test("input and output tokens count together", () => {
  const budget = createBudget(limitsOf({ maxTokens: 1000 }));
  budget.chargeUsage({ input: 400, output: 300 });
  assert.throws(() => budget.chargeUsage({ input: 200, output: 200 }), (e) => e instanceof LimitError && e.reason === "tokens");
  assert.deepEqual(budget.usage(), { input: 600, output: 500, searches: 0, steps: 0 });
});

test("searches over the cap throw and the remaining count goes down", () => {
  const budget = createBudget(limitsOf({ maxSearches: 3 }));
  assert.equal(budget.remainingSearches(), 3);
  budget.chargeUsage({ input: 1, output: 1, searches: 2 });
  assert.equal(budget.remainingSearches(), 1);
  assert.throws(() => budget.chargeUsage({ input: 1, output: 1, searches: 2 }), (e) => e.reason === "searches");
  assert.equal(budget.remainingSearches(), 0);
});

test("check throws on time and remainingMs never goes negative", () => {
  let clock = 1000;
  const budget = createBudget(limitsOf(), { now: () => clock, timeLimitMs: 5000 });
  budget.check();
  assert.equal(budget.remainingMs(), 5000);
  clock = 4000;
  assert.equal(budget.remainingMs(), 2000);
  clock = 6000;
  assert.throws(() => budget.check(), (e) => e instanceof LimitError && e.reason === "time");
  clock = 99999;
  assert.equal(budget.remainingMs(), 0);
});

test("missing usage fields count as zero and bad numbers are ignored", () => {
  const budget = createBudget(limitsOf());
  budget.chargeUsage({ input: 10 });
  budget.chargeUsage({ input: NaN, output: -5, searches: "x" });
  assert.deepEqual(budget.usage(), { input: 10, output: 0, searches: 0, steps: 0 });
});

test("limits above the hard maximum are clamped", () => {
  const budget = createBudget({ maxSteps: 9999, maxTokens: 9999999, maxSearches: 999 });
  for (let i = 0; i < 60; i++) budget.chargeStep();
  assert.throws(() => budget.chargeStep(), (e) => e.reason === "steps");
});

test("check keeps reporting a limit that was already exceeded", () => {
  const budget = createBudget(limitsOf({ maxTokens: 100 }));
  assert.throws(() => budget.chargeUsage({ input: 200, output: 0 }));
  assert.throws(() => budget.check(), (e) => e.reason === "tokens");
});

test("remainingTokens counts down and never goes negative", () => {
  const budget = createBudget(limitsOf({ maxTokens: 1000 }));
  assert.equal(budget.remainingTokens(), 1000);
  budget.chargeUsage({ input: 300, output: 200 });
  assert.equal(budget.remainingTokens(), 500);
  assert.throws(() => budget.chargeUsage({ input: 900, output: 0 }));
  assert.equal(budget.remainingTokens(), 0);
});
