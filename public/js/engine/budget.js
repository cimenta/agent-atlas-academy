// Counts what a run has used and stops it when a limit is passed.
import { clampLimits } from "./patterns.js";

export const TIME_LIMIT_MS = 270000;

// A limit of the run (reason steps, tokens, searches or time) or of one agent (reason agent_steps, agent_tokens or
// agent_searches; then extra holds the agent id, its label and the limit it had).
export class LimitError extends Error {
  constructor(reason, extra = {}) {
    super(`Limit reached: ${reason}`);
    this.name = "LimitError";
    this.reason = reason;
    Object.assign(this, extra);
  }
}

// Thrown by the budget of one agent. The agent turns it into a LimitError (stop) or hands on what it wrote (pass).
export class AgentLimitError extends Error {
  constructor(reason) {
    super(`Agent limit reached: ${reason}`);
    this.name = "AgentLimitError";
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

  const budget = {
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
    remainingTokens: () => Math.max(0, max.maxTokens - used.input - used.output),
    remainingSearches: () => Math.max(0, max.maxSearches - used.searches),
    remainingMs: () => Math.max(0, timeLimitMs - elapsed()),
    usage: () => ({ ...used }),
    check,

    // The budget of one agent: it charges the run too, and also counts what this agent used against its own limits
    // (maxSteps, maxTokens, maxSearches; a limit that is not given is none). What is left is never more than the run has left.
    forAgent(limits = {}) {
      const own = { input: 0, output: 0, searches: 0, steps: 0 };
      const cap = (key) => (typeof limits?.[key] === "number" ? limits[key] : Infinity);
      const ceiling = { steps: cap("maxSteps"), tokens: cap("maxTokens"), searches: cap("maxSearches") };
      return {
        chargeStep() {
          // Asked first, so a step the agent may not take is not counted against the run.
          if (own.steps + 1 > ceiling.steps) throw new AgentLimitError("steps");
          budget.chargeStep();
          own.steps += 1;
        },
        chargeUsage(charge = {}) {
          own.input += amount(charge.input);
          own.output += amount(charge.output);
          own.searches += amount(charge.searches);
          budget.chargeUsage(charge);
          if (own.input + own.output > ceiling.tokens) throw new AgentLimitError("tokens");
          if (own.searches > ceiling.searches) throw new AgentLimitError("searches");
        },
        remainingTokens: () => Math.min(budget.remainingTokens(), Math.max(0, ceiling.tokens - own.input - own.output)),
        remainingSearches: () => Math.min(budget.remainingSearches(), Math.max(0, ceiling.searches - own.searches)),
        remainingMs: budget.remainingMs,
        usage: () => ({ ...own }),
        check,
      };
    },
  };
  return budget;
}
