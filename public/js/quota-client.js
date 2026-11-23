import { parseGroqHeaders } from "./engine/quota.js";
// Free requests left today at OpenRouter: asks our server (the page cannot reach the provider) and remembers the last answer in memory only,
// with the time it was made. No DOM here. Nothing is stored on disk and the key is never kept.
const KNOWN_ERRORS = new Set(["rejected", "rate_limit", "bad_key", "bad_provider", "unknown"]);

// { ok: true, used, limit, remaining, resetsAt } or { ok: false, error: "rejected" | "unreachable" | "rate_limit" | "bad_key" | "bad_provider" | "unknown" }.
export async function fetchQuota({ provider = "openrouter", key, fetchFn = fetch }) {
  try {
    const response = await fetchFn("/api/quota", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, key }) });
    const data = await response.json();
    if (response.ok && data?.ok === true && [data.used, data.limit, data.remaining].every((n) => Number.isFinite(n) && n >= 0)) return { ok: true, used: data.used, limit: data.limit, remaining: data.remaining, resetsAt: typeof data.resetsAt === "string" ? data.resetsAt : null };
    return { ok: false, error: KNOWN_ERRORS.has(data?.error) ? data.error : "unreachable" };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

// One reading of an answer for both pages, so they cannot disagree: "out" at 0 left, "low" at 5 or fewer, "ok" otherwise.
export const quotaLevelOf = (quota) => (!quota || quota.remaining > 5 ? "ok" : quota.remaining <= 0 ? "out" : "low");

const clock = (date) => (date instanceof Date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
const clockShort = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); };

// t: the translator. entry: { at, result } of the store, result.ok. The tooltip of the pill on the card.
export const quotaTitle = (t, entry) => `${t("quota.title", { used: entry.result.used, limit: entry.result.limit, time: clock(entry.at) })}${entry.result.remaining <= 0 ? ` ${t("quota.resets", { time: clockShort(entry.result.resetsAt) })}` : ""}`;

export const quotaClock = clock;
export const quotaTime = clockShort;

// A small store for the pages: one entry per key slot, { at: Date, result }. refresh() asks the server and tells the listeners.
export function createQuotaStore({ fetchFn = fetch, now = () => new Date() } = {}) {
  const entries = new Map();
  const listeners = new Set();
  const pending = new Map();
  const notify = (slot) => { for (const fn of [...listeners]) fn(slot, entries.get(slot) ?? null); };
  return {
    get: (slot) => entries.get(slot) ?? null,
    busy: (slot) => pending.has(slot),
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Asks again, whatever is remembered. Two calls at once for one slot share one question.
    refresh(slot, key) {
      if (pending.has(slot)) return pending.get(slot);
      if (typeof key !== "string" || key === "") { entries.delete(slot); notify(slot); return Promise.resolve(null); }
      const work = fetchQuota({ key, fetchFn }).then((result) => {
        pending.delete(slot);
        const entry = { at: now(), result };
        entries.set(slot, entry);
        notify(slot);
        return entry;
      });
      pending.set(slot, work);
      notify(slot);
      return work;
    },
    forget(slot) { entries.delete(slot); notify(slot); },
    // A number that was not asked for but seen: the headers of the last call to a provider (Groq). Kept under the key given.
    observe(key, quota, at = now()) {
      entries.set(key, { at, result: { ok: true, used: quota.used, limit: quota.limit, remaining: quota.remaining, resetsAt: null, tokens: quota.tokens ?? null, resetText: quota.resetText ?? null, seen: true } });
      notify(key);
    },
  };
}

// The store both pages use: the number Create shows and the number Settings shows are the same one.
export const quotaStore = createQuotaStore();

// An api_call event of a run: a call to Groq with the headers of its answer feeds the store (key "groq"). Anything else is ignored.
export function observeApiCall(store, event, now = () => new Date()) {
  if (event?.type !== "api_call" || event.provider !== "groq") return;
  const quota = parseGroqHeaders(event.response?.headers);
  if (quota) store.observe("groq", quota, now());
}

// The tooltip for a number that was seen in the last call, not asked for.
export const quotaSeenTitle = (t, entry) => t("quota.titleSeen", { remaining: entry.result.remaining, limit: entry.result.limit, time: clock(entry.at) });
