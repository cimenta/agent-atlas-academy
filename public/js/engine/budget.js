// Counts what a run has used and stops it when a limit is passed.
import { clampLimits } from "./patterns.js";

export const TIME_LIMIT_MS = 270000;

export class LimitError extends Error {
  constructor(reason) {
    super(`Limit reached: ${reason}`);
    this.name = "LimitError";
    this.reason = reason;
  }
}

const amount = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

export function createBudget(limits, { now = Date.now, timeLimitMs = TIME_LIMIT_MS } = {}) {
  const max = clampLimits(limits);
  const startedAt = now();
  const used = { input: 0, output: 0, searches: 0, steps: 0 };

  const elapsed = () => now() - startedAt;
  const exceeded = () => {
    if (elapsed() >= timeLimitMs) return "time";
    if (used.steps > max.maxSteps) return "steps";
    if (used.input + used.output > max.maxTokens) return "tokens";
    if (used.searches > max.maxSearches) return "searches";
    return null;
  };
  const check = () => {
    const reason = exceeded();
    if (reason) throw new LimitError(reason);
  };

  return {
    chargeStep() {
      used.steps += 1;
      check();
    },
    chargeUsage({ input, output, searches } = {}) {
      used.input += amount(input);
      used.output += amount(output);
      used.searches += amount(searches);
      check();
    },
    remainingSearches: () => Math.max(0, max.maxSearches - used.searches),
    remainingMs: () => Math.max(0, timeLimitMs - elapsed()),
    usage: () => ({ ...used }),
    check,
  };
}
