// The harness is everything around the model: the limits, the time and size rules, the retries and the key handling.
// This file lists the rules the visitor cannot change (shown on the Harness tab in Settings) and words the message
// that a replay shows when a limit stopped the run.
import { NODE_MAX, TASK_MAX_CHARS, MAX_PAUSES, REQUEST_MAX_BYTES, RESUME_MAX_BYTES, DEFAULT_RUNS_PER_HOUR } from "./catalog.js";
import { TIME_LIMIT_MS } from "./budget.js";

// The fixed rules, in the order they are shown. The words (label, hint, value) are in the locale files as
// harness.fixed.<id>.label, .hint and .value; params fills the value from the real constant, so the page cannot drift from the code.
export function fixedRules() {
  return [
    { id: "time", params: { n: TIME_LIMIT_MS / 1000 } },
    { id: "agents", params: { n: NODE_MAX } },
    { id: "task", params: { n: TASK_MAX_CHARS } },
    { id: "request", params: { a: REQUEST_MAX_BYTES / 1024, b: RESUME_MAX_BYTES / 1024 } },
    { id: "pauses", params: { n: MAX_PAUSES } },
    { id: "rate", params: { n: DEFAULT_RUNS_PER_HOUR } },
    { id: "keys", params: {} },
  ];
}

// The warning a replay holds when a limit stopped the run (English, like the other messages of the engine).
export function limitMessage(reason, limits) {
  const { maxSteps, maxTokens, maxSearches } = limits ?? {};
  switch (reason) {
    case "steps":
      return `Limit reached: steps (${maxSteps} per run). The run was stopped before it could finish. Raise the limit in Settings, Harness, and run again.`;
    case "tokens":
      return `Limit reached: tokens (${maxTokens} per run). The run was stopped before it could finish. Raise the limit in Settings, Harness, and run again.`;
    case "searches":
      return `Limit reached: web searches (${maxSearches} per run). The run was stopped before it could finish. Raise the limit in Settings, Harness, and run again.`;
    case "time":
      return `Limit reached: time (${TIME_LIMIT_MS / 1000} seconds per run). This limit is fixed. The run was stopped before it could finish.`;
    default:
      return `Limit reached: ${reason}. The run was stopped before it could finish.`;
  }
}
