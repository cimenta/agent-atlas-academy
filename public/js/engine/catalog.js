// What a design may contain: models, agent types and the hard numbers.
// Pure data, shared by the browser and the server function.
import { isSlot, slotProvider, slotIsFree } from "../key-slots.js";

// The models, prices and providers live in the registry (providers.js); they are re-exported here under their old names.
import { PROVIDERS, PROVIDER_IDS, PRICES_AS_OF, MODELS, SEARCH_PRICE_USD, GOOGLE_MODELS, resolveModel, overrideIdOk } from "./providers.js";
export { PRICES_AS_OF, MODELS, SEARCH_PRICE_USD, GOOGLE_MODELS, PROVIDER_IDS };

export const DEFAULT_MODEL = "fast";

export const PROVIDER_CATALOG = Object.fromEntries(PROVIDER_IDS.map((id) => [id, { label: PROVIDERS[id].label, models: PROVIDERS[id].models, searchPriceUsd: PROVIDERS[id].searchPriceUsd, pricesAsOf: PROVIDERS[id].pricesAsOf }]));
export const PRICING_URLS = Object.fromEntries(PROVIDER_IDS.map((id) => [id, PROVIDERS[id].pricingUrl]));

export const providerCatalog = (provider) => PROVIDER_CATALOG[provider] ?? PROVIDER_CATALOG.anthropic;
export const pricesFor = (provider) => {
  const c = providerCatalog(provider);
  return { models: c.models, search: c.searchPriceUsd, pricesAsOf: c.pricesAsOf };
};
// An agent may name its own key slot (and so its provider); one without a slot uses the provider of the whole run.
export const nodeProvider = (node, fallback = "anthropic") => (isSlot(node?.slot) ? slotProvider(node.slot) : fallback);
// The model of an agent as its key slot sees it (the free slot of OpenRouter has its own ids). node.modelId is the id a student chose
// for a free model that OpenRouter no longer offers; it counts only on a free slot that has own ids, and only with a safe shape.
export const nodeModel = (node, fallback = "anthropic") => {
  const models = providerCatalog(nodeProvider(node, fallback)).models;
  const slot = isSlot(node?.slot) ? node.slot : null;
  const found = resolveModel(slot, models.find((m) => m.key === node?.model) ?? models[0]);
  const own = slot !== null && slotIsFree(slot) && typeof found.freeId === "string" && overrideIdOk(node?.modelId) && found.id !== node.modelId;
  // A model the student chose may not take a forced reply format; the app repairs the format when needed, so none is forced.
  return own ? { ...found, id: node.modelId, forcedFormat: false } : found;
};
// The same agent asking for another tier (a reviewer, a condensing call): the picked model belongs to the agent's own tier only.
export const withTier = (node, tier) => (tier === node.model ? node : { ...node, model: tier, modelId: undefined });
// The providers a design uses, each once, in the order of its agents.
export const providersOf = (design, fallback = "anthropic") => {
  const out = [];
  for (const node of design?.nodes ?? []) {
    const p = nodeProvider(node, fallback);
    if (!out.includes(p)) out.push(p);
  }
  return out.length > 0 ? out : [fallback];
};
// True when the design uses a model that has no free tier at the provider.
export const paidOnlyModelUsed = (design, provider) =>
  (design?.nodes ?? []).some((n) => providerCatalog(nodeProvider(n, provider)).models.find((m) => m.key === n.model)?.freeTier === false);

const GENERAL = ["sequential", "parallel", "supervisor", "handoff", "router", "voting"];

// The longest text of the criteria an evaluator judges by (evaluator loop).
export const CRITERIA_MAX = 1000;

export const AGENT_TYPES = {
  planner: { label: "Planner", patterns: [...GENERAL, "planexec"], searchDefault: false, free: false },
  researcher: { label: "Researcher", patterns: GENERAL, searchDefault: true, free: false },
  critic: { label: "Critic", patterns: GENERAL, searchDefault: false, free: false },
  writer: { label: "Writer", patterns: [...GENERAL, "evaluator"], searchDefault: false, free: false },
  supervisor: { label: "Supervisor", patterns: ["supervisor"], searchDefault: false, free: false },
  combiner: { label: "Combiner", patterns: ["parallel"], searchDefault: false, free: false },
  debater: { label: "Debater", patterns: ["debate"], searchDefault: false, free: false },
  judge: { label: "Judge", patterns: ["debate"], searchDefault: false, free: false },
  evaluator: { label: "Evaluator", patterns: ["evaluator"], searchDefault: false, free: false },
  router: { label: "Router", patterns: ["router"], searchDefault: false, free: false },
  tally: { label: "Tally", patterns: ["voting"], searchDefault: false, free: false },
  splitter: { label: "Splitter", patterns: ["mapreduce"], searchDefault: false, free: false },
  worker: { label: "Worker", patterns: ["mapreduce"], searchDefault: false, free: false },
  reducer: { label: "Reducer", patterns: ["mapreduce"], searchDefault: false, free: false },
  executor: { label: "Executor", patterns: ["planexec"], searchDefault: false, free: false },
  free: { label: "Free agent", patterns: GENERAL, searchDefault: false, free: true },
};

// How long a request to a model may wait for an answer, in seconds. The visitor can change it in Settings.
export const TIMEOUT_SEC = { min: 30, max: 120, step: 10, default: 60 };
// A provider whose models answer slowly waits longer: the wait of Settings is multiplied by this (Cloudflare: its Strong model writes a long
// answer in more than a minute, and a call that is cut off at 60 seconds is lost together with the neurons it used).
export const SLOW_PROVIDER_TIMEOUT_FACTOR = { cloudflare: 2 };
export const timeoutMsFor = (provider, timeoutMs) => timeoutMs * (SLOW_PROVIDER_TIMEOUT_FACTOR[provider] ?? 1);
export const clampTimeoutSec = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(TIMEOUT_SEC.max, Math.max(TIMEOUT_SEC.min, n)) : TIMEOUT_SEC.default;
};

// How many tokens one reply of one agent may have. The visitor can lower it in Settings; it never goes above the maximum.
export const OUTPUT_TOKENS = { min: 1000, max: 4000, step: 500, default: 4000 };
export const clampOutputTokens = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(OUTPUT_TOKENS.max, Math.max(OUTPUT_TOKENS.min, n)) : OUTPUT_TOKENS.default;
};

// How a failed provider call is tried again: how many more tries, and how long to wait before each.
export const RETRIES = { min: 0, max: 3, step: 1, default: 1 };
export const RETRY_DELAY_SEC = { min: 1, max: 10, step: 0.5, default: 1.5 };
export const clampRetries = (value) => {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(RETRIES.max, Math.max(RETRIES.min, n)) : RETRIES.default;
};
export const clampRetryDelaySec = (value) => {
  const n = Math.round(Number(value) * 2) / 2;
  return Number.isFinite(n) && value !== null && value !== "" ? Math.min(RETRY_DELAY_SEC.max, Math.max(RETRY_DELAY_SEC.min, n)) : RETRY_DELAY_SEC.default;
};

// A provider that limits a free account (Groq) can answer 429 and ask the app to wait. The app waits by itself at most this many
// seconds, and at most RATE_WAITS_MAX times in a row; after that the run stops and is carried on later.
export const RATE_WAIT_MAX_SEC = 60;
export const RATE_WAITS_MAX = 3;

// The fixed rules of the harness: the visitor cannot change them (see the Harness tab in Settings).
export const MAX_PAUSES = 4; // pauses of the model in one agent turn
export const REQUEST_MAX_BYTES = 65536; // a request to start a run
export const RESUME_MAX_BYTES = 262144; // a run that is carried on also sends the answers of the agents that finished
export const MODEL_CHECKS_PER_HOUR = 30; // checks of the list of models one address may make in an hour (Settings, Check models)
export const DEFAULT_RUNS_PER_HOUR = 10; // runs one address may start in an hour (the site operator can change it)
export const RUN_STORE_MAX_BYTES = 2 * 1024 * 1024; // one saved run

export const LIMIT_DEFAULTS = { maxSteps: 20, maxTokens: 40000, maxSearches: 3 };
export const LIMIT_MAX = { maxSteps: 60, maxTokens: 150000, maxSearches: 10 };

export const TASK_MAX_CHARS = 1000;
export const NODE_MAX = 8;
export const NAME_MAX = 40;
export const INSTRUCTIONS_MAX = 2000;
// Agents that create agents: the agent types that may, and the most one of them may be allowed to create.
export const CREATOR_TYPES = ["supervisor", "planner"];
export const CREATE_MAX = 4;

// Profiles: one choice that sets the five adjustable limits at once. Balanced is the default set.
export const PROFILES = {
  careful: { steps: 10, tokens: 20000, searches: 1, output: 2000, timeout: 30 },
  balanced: { steps: LIMIT_DEFAULTS.maxSteps, tokens: LIMIT_DEFAULTS.maxTokens, searches: LIMIT_DEFAULTS.maxSearches, output: OUTPUT_TOKENS.default, timeout: TIMEOUT_SEC.default },
  generous: { steps: 40, tokens: 100000, searches: 6, output: OUTPUT_TOKENS.max, timeout: TIMEOUT_SEC.max },
};
// The profile whose values are exactly these ones, or "custom".
export const matchProfile = (values) => Object.keys(PROFILES).find((id) => Object.keys(PROFILES[id]).every((k) => Number(values?.[k]) === PROFILES[id][k])) ?? "custom";

// The cost cap: a run stops when its estimated cost passes this amount (US dollars). 0 means off.
export const COST_CAP_USD = { min: 0.1, max: 5, step: 0.1, default: 0 };
export const clampCostCap = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return COST_CAP_USD.default;
  return Math.min(COST_CAP_USD.max, Math.max(COST_CAP_USD.min, Math.round(n * 100) / 100));
};

// Loop detection: a run stops when one agent gives the same answer this many times in a row. 0 means off.
export const REPEAT_STOP = { min: 2, max: 4, default: 3 };
export const clampRepeatStop = (value) => {
  if (value === undefined || value === null || value === "") return REPEAT_STOP.default;
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return REPEAT_STOP.default;
  return n < REPEAT_STOP.min ? 0 : Math.min(REPEAT_STOP.max, n);
};

// The most characters one agent passes on to the next. 0 means no cut.
export const HANDOFF_CHARS = { min: 2000, max: 20000, step: 2000, default: 0 };
export const clampHandoffChars = (value) => {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n <= 0) return HANDOFF_CHARS.default;
  return Math.min(HANDOFF_CHARS.max, Math.max(HANDOFF_CHARS.min, n));
};

// What to do when an agent still fails after all its tries: nothing (off), suggest a model for Retry (suggest, the default),
// or try once more with another model of the same provider (auto).
export const FALLBACK_MODES = ["off", "suggest", "auto"];
export const FALLBACK_DEFAULT = "suggest";
export const clampFallback = (value) => (FALLBACK_MODES.includes(value) ? value : FALLBACK_DEFAULT);

// The model to fall back to: the same provider and key, never a costlier tier than Balanced, so a busy model is swapped for a calmer one.
const FALLBACK_TIER = { fast: "balanced", balanced: "fast", strong: "balanced" };
// null when there is none: no such model, the same model, or a model the free Gemini key cannot use.
export function fallbackModelFor(node, provider = "anthropic", freeTier = false) {
  const models = providerCatalog(nodeProvider(node, provider)).models;
  const now = nodeModel(node, provider);
  const found = models.find((m) => m.key === FALLBACK_TIER[now.key]);
  const target = found && resolveModel(isSlot(node?.slot) ? node.slot : null, found);
  if (!target || target.id === now.id) return null;
  if (target.freeTier === false && (freeTier || node?.slot === "google-free")) return null;
  return target;
}
