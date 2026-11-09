// In-memory fixed-window-by-timestamps limiter. Per server instance, which is enough for a free demo.
const hits = new Map();
const MAX_KEYS = 5000;

export function rateLimit(key, max = 10, windowMs = 3600000, now = Date.now()) {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > MAX_KEYS) {
    for (const [k, times] of hits) {
      if (times.every((t) => now - t >= windowMs)) hits.delete(k);
    }
  }
  return true;
}
