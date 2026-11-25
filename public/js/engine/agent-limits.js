// Limits of one agent (node.limits) and what the agent does when it reaches one (node.onLimit).
// A limit that is not set means the agent has none of its own and the limits of the whole run apply.
// An agent limit never lifts a limit of the run: the lower of the two always wins.
import { LIMIT_MAX, OUTPUT_TOKENS, TOOL_LIMITS } from "./catalog.js";

export const AGENT_LIMIT_KEYS = ["maxSteps", "maxTokens", "maxOutputTokens", "maxSearches", "maxToolCalls"];
export const ON_LIMIT = ["stop", "pass"];

const RANGES = {
  maxSteps: { min: 1, max: LIMIT_MAX.maxSteps },
  maxTokens: { min: 1000, max: LIMIT_MAX.maxTokens },
  maxOutputTokens: { min: OUTPUT_TOKENS.min, max: OUTPUT_TOKENS.max },
  maxSearches: { min: 0, max: LIMIT_MAX.maxSearches },
  maxToolCalls: { min: 1, max: TOOL_LIMITS.callsMax },
};

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export const agentLimitRange = (key) => ({ ...RANGES[key] });

// True for an object with only known limits, each a whole number inside its range.
export function validNodeLimits(limits) {
  if (!isObject(limits)) return false;
  return Object.entries(limits).every(([key, value]) => key in RANGES && Number.isInteger(value) && value >= RANGES[key].min && value <= RANGES[key].max);
}

// The valid, clamped limits of whatever was given, or undefined when none is left (so the node carries no empty object).
export function cleanNodeLimits(raw) {
  if (!isObject(raw)) return undefined;
  const out = {};
  for (const key of AGENT_LIMIT_KEYS) {
    const value = raw[key];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out[key] = Math.min(RANGES[key].max, Math.max(RANGES[key].min, Math.round(value)));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
