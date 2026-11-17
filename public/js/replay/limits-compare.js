// Retry with the limits of Settings or with the limits the run had: the table of both, and a guess whether the run stops.
import { clampLimits } from "../engine/patterns.js";
import { labSteps, simulate } from "../harness-lab-model.js";

export const LIMIT_ROWS = [
  { key: "maxSteps", label: "limits.steps" },
  { key: "maxTokens", label: "limits.tokens" },
  { key: "maxSearches", label: "limits.searches" },
];

// rows: what Settings give now and what the run had; differs says whether any row is different.
export function compareLimits(current, original) {
  const now = clampLimits(current);
  const had = clampLimits(original);
  const rows = LIMIT_ROWS.map((row) => ({ ...row, now: now[row.key], had: had[row.key], differs: now[row.key] !== had[row.key] }));
  return { rows, differs: rows.some((r) => r.differs), now, had };
}

// A guess from the steps the run recorded so far: null when nothing says it stops, otherwise
// { step, reason, value, recorded }. recorded is true when the steps already recorded pass a limit;
// false when they fit exactly and the agent that is retried has no room left for its own step.
// The time of a whole run is fixed, so only steps and tokens can decide this.
export function predictStop(record, limits, repeatStop = 0) {
  const steps = labSteps(record);
  if (steps.length === 0) return null;
  const max = clampLimits(limits);
  const result = simulate(steps, { maxSteps: max.maxSteps, maxTokens: max.maxTokens, timeSec: 270, repeatStop });
  if (!result.finished) return { step: result.stop.index + 1, reason: result.stop.reason, value: result.stop.value, recorded: true };
  if (result.used.steps >= max.maxSteps) return { step: result.used.steps + 1, reason: "steps", value: max.maxSteps, recorded: false };
  if (result.used.tokens >= max.maxTokens) return { step: result.used.steps + 1, reason: "tokens", value: max.maxTokens, recorded: false };
  return null;
}

// The run record with the limits of Settings in place of the ones it had (Retry with the current limits).
export function withCurrentLimits(record, limits) {
  return { ...record, limits: clampLimits(limits) };
}

// The address of the Harness lab for this run with these limits.
export function labHref(record, limits, repeatStop = 0) {
  const max = clampLimits(limits);
  return `#/learn/lab?run=${encodeURIComponent(record.id)}&steps=${max.maxSteps}&tokens=${max.maxTokens}&repeat=${repeatStop}`;
}
