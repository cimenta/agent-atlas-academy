// What a design may contain: models, agent types and the hard numbers.
// Pure data, shared by the browser and the server function.
import { isSlot, slotProvider } from "../key-slots.js";

// Prices are US dollars per million tokens. They are the figures of the current
// published tiers and are shown to the visitor only as an estimate.
// Check them against Anthropic's pricing page before every release.
export const PRICES_AS_OF = "2026-11-09";

export const MODELS = [
  { key: "fast", id: "claude-haiku-5-5", label: "Fast", inputPerMTok: 1, outputPerMTok: 5 },
  { key: "balanced", id: "claude-sonnet-5-5", label: "Balanced", inputPerMTok: 3, outputPerMTok: 15 },
  { key: "strong", id: "claude-opus-5-5", label: "Strong", inputPerMTok: 5, outputPerMTok: 25 },
];

export const DEFAULT_MODEL = "fast";

// Anthropic bills each web search on top of the tokens (10 dollars per 1000).
export const SEARCH_PRICE_USD = 0.01;

// Google Gemini: the same three choices (fast, balanced, strong) with Google's models and prices.
// Check them against https://aistudio.google.com/docs/pricing before every release.
// Google raises some of these prices on 2026-12-01 and 2027-01-01.
// freeTier: false marks a model that Google does not offer on its free tier.
export const GOOGLE_MODELS = [
  { key: "fast", id: "gemini-3.5-flash-lite", label: "Fast", inputPerMTok: 0.3, outputPerMTok: 2.5, freeTier: true },
  { key: "balanced", id: "gemini-3.8-flash", label: "Balanced", inputPerMTok: 0.75, outputPerMTok: 3.75, freeTier: true },
  { key: "strong", id: "gemini-4-carbon", label: "Strong", inputPerMTok: 2, outputPerMTok: 10, freeTier: false },
];

export const PROVIDER_CATALOG = {
  anthropic: { label: "Anthropic", models: MODELS, searchPriceUsd: SEARCH_PRICE_USD, pricesAsOf: PRICES_AS_OF },
  // Grounding with Google Search: 14 dollars per 1000 after the free monthly allowance (shown as an upper bound).
  google: { label: "Google", models: GOOGLE_MODELS, searchPriceUsd: 0.014, pricesAsOf: "2026-11-13" },
};
export const PROVIDER_IDS = Object.keys(PROVIDER_CATALOG);
export const PRICING_URLS = { anthropic: "https://www.anthropic.com/pricing", google: "https://aistudio.google.com/docs/pricing" };

export const providerCatalog = (provider) => PROVIDER_CATALOG[provider] ?? PROVIDER_CATALOG.anthropic;
export const pricesFor = (provider) => {
  const c = providerCatalog(provider);
  return { models: c.models, search: c.searchPriceUsd, pricesAsOf: c.pricesAsOf };
};
// An agent may name its own key slot (and so its provider); one without a slot uses the provider of the whole run.
export const nodeProvider = (node, fallback = "anthropic") => (isSlot(node?.slot) ? slotProvider(node.slot) : fallback);
export const nodeModel = (node, fallback = "anthropic") => {
  const models = providerCatalog(nodeProvider(node, fallback)).models;
  return models.find((m) => m.key === node?.model) ?? models[0];
};
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

const GENERAL = ["sequential", "parallel", "supervisor"];

export const AGENT_TYPES = {
  planner: { label: "Planner", patterns: GENERAL, searchDefault: false, free: false },
  researcher: { label: "Researcher", patterns: GENERAL, searchDefault: true, free: false },
  critic: { label: "Critic", patterns: GENERAL, searchDefault: false, free: false },
  writer: { label: "Writer", patterns: GENERAL, searchDefault: false, free: false },
  supervisor: { label: "Supervisor", patterns: ["supervisor"], searchDefault: false, free: false },
  combiner: { label: "Combiner", patterns: ["parallel"], searchDefault: false, free: false },
  debater: { label: "Debater", patterns: ["debate"], searchDefault: false, free: false },
  judge: { label: "Judge", patterns: ["debate"], searchDefault: false, free: false },
  free: { label: "Free agent", patterns: GENERAL, searchDefault: false, free: true },
};

// How long a request to a model may wait for an answer, in seconds. The visitor can change it in Settings.
export const TIMEOUT_SEC = { min: 30, max: 120, step: 10, default: 60 };
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

// The fixed rules of the harness: the visitor cannot change them (see the Harness tab in Settings).
export const MAX_PAUSES = 4; // pauses of the model in one agent turn
export const REQUEST_MAX_BYTES = 65536; // a request to start a run
export const RESUME_MAX_BYTES = 262144; // a run that is carried on also sends the answers of the agents that finished
export const DEFAULT_RUNS_PER_HOUR = 10; // runs one address may start in an hour (the site operator can change it)
export const RUN_STORE_MAX_BYTES = 2 * 1024 * 1024; // one saved run

export const LIMIT_DEFAULTS = { maxSteps: 20, maxTokens: 40000, maxSearches: 3 };
export const LIMIT_MAX = { maxSteps: 60, maxTokens: 150000, maxSearches: 10 };

export const TASK_MAX_CHARS = 1000;
export const NODE_MAX = 8;
export const NAME_MAX = 40;
export const INSTRUCTIONS_MAX = 2000;
