// Free requests left today at a provider. Today only OpenRouter says it: GET /key answers, among other things, how many calls to
// free models the key has used today and what the daily limit is (50 under 10 credits, 1000 from 10 credits; it resets at 00:00 UTC).
// The answer is foreign data: it is read defensively and only three numbers leave this file.

const count = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e7 ? Math.floor(value) : null);

// data: the parsed answer of GET /key. Returns { used, limit, remaining } or null when the answer does not say.
export function parseFreeQuota(data) {
  const root = data !== null && typeof data === "object" && data.data !== null && typeof data.data === "object" ? data.data : data;
  const block = root?.free_model_daily_requests ?? root?.free_models_daily_requests ?? null;
  if (block === null || typeof block !== "object") return null;
  let used = count(block.used);
  let limit = count(block.limit);
  let remaining = count(block.remaining);
  if (limit === null && used !== null && remaining !== null) limit = used + remaining;
  if (used === null && limit !== null && remaining !== null) used = Math.max(0, limit - remaining);
  if (limit === null || used === null || limit === 0) return null;
  if (remaining === null) remaining = Math.max(0, limit - used);
  return { used, limit, remaining: Math.min(remaining, limit) };
}

// Midnight UTC after `now`: when the daily count starts again.
export function nextResetUtc(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString();
}


const header = (value) => {
  const n = typeof value === "string" && value.trim() !== "" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) && n >= 0 && n <= 1e9 ? Math.floor(n) : null;
};

// Groq cannot say its count without a call to a model: it sends it in the headers of every answer. headers: the headers of one answer (lower-case names).
// Returns { used, limit, remaining, tokens: { limit, remaining } | null, resetText } for the requests of the day, or null when the answer has no such headers
// (the answer of a per-minute limit has only the token ones, and is ignored).
export function parseGroqHeaders(headers) {
  if (headers === null || typeof headers !== "object") return null;
  const limit = header(headers["x-ratelimit-limit-requests"]);
  const remaining = header(headers["x-ratelimit-remaining-requests"]);
  if (limit === null || remaining === null || limit === 0) return null;
  const tokenLimit = header(headers["x-ratelimit-limit-tokens"]);
  const tokenRemaining = header(headers["x-ratelimit-remaining-tokens"]);
  const reset = headers["x-ratelimit-reset-requests"];
  return {
    used: Math.max(0, limit - remaining),
    limit,
    remaining: Math.min(remaining, limit),
    tokens: tokenLimit !== null && tokenRemaining !== null ? { limit: tokenLimit, remaining: tokenRemaining } : null,
    resetText: typeof reset === "string" && reset.length <= 40 ? reset : null,
  };
}

// Before a run: does it fit in what is left today? calls: the calls the run is expected to make to this provider, remaining: what is left, or null when unknown.
// "unknown" (nothing known yet), "ok", "tight" (more than 70 percent of what is left: a repeated call may break it), "over" (more than is left, also at none left).
export function runFit(calls, remaining) {
  if (remaining === null || remaining === undefined) return "unknown";
  if (remaining <= 0 || calls > remaining) return "over";
  return calls > remaining * 0.7 ? "tight" : "ok";
}
