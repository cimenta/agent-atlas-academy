// What a design may contain: models, agent types and the hard numbers.
// Pure data, shared by the browser and the server function.

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

export const LIMIT_DEFAULTS = { maxSteps: 20, maxTokens: 40000, maxSearches: 3 };
export const LIMIT_MAX = { maxSteps: 60, maxTokens: 150000, maxSearches: 10 };

export const TASK_MAX_CHARS = 1000;
export const NODE_MAX = 8;
export const NAME_MAX = 40;
export const INSTRUCTIONS_MAX = 2000;
