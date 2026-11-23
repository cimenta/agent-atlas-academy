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

