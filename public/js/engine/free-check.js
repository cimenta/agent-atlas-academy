// The free models of OpenRouter change often. Before they are used the app compares the three it needs with OpenRouter's public list.
// It never picks a replacement itself: the student picks one from the current free models, and the pick is kept in Settings as an override
// for a tier. Pure: no page, no storage; the fetch function is passed in.
import { overrideIdOk } from "./providers.js";

// The only slot whose model ids can be replaced, and the tiers it has.
export const OVERRIDE_SLOT = "openrouter-free";
export const OVERRIDE_TIERS = ["fast", "balanced", "strong"];
const NAME_MAX = 80;

const cleanName = (value, fallback) => {
  const text = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
  return text === "" ? fallback : text;
};

// { "openrouter-free": { fast?, balanced?, strong? } }: only the known slot and tiers, only ids of a safe shape; empty when none is left.
export function cleanOverrides(raw) {
  const own = raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw[OVERRIDE_SLOT] : null;
  if (own === null || typeof own !== "object" || Array.isArray(own)) return {};
  const tiers = Object.fromEntries(OVERRIDE_TIERS.filter((key) => overrideIdOk(own[key])).map((key) => [key, own[key]]));
  return Object.keys(tiers).length > 0 ? { [OVERRIDE_SLOT]: tiers } : {};
}

// What the live list says about the three free models of the slot. slotModels: modelsOfSlot("openrouter-free"). live: { ids, models }
// as createFreeCheck gives it. overrides: { fast?, balanced?, strong? } for this slot.
// { state: "ok" | "gone" | "unknown", gone: [{ key, id }], candidates: [{ id, name, forcedFormat }] }.
export function compareFree({ slotModels, live, overrides }) {
  const valid = live !== null && typeof live === "object" && Array.isArray(live.ids) && live.ids.length > 0 && Array.isArray(live.models);
  if (!valid) return { state: "unknown", gone: [], candidates: [] };
  const present = new Set(live.ids.filter((id) => typeof id === "string"));
  const gone = [];
  for (const model of slotModels) {
    const id = overrideIdOk(overrides?.[model.key]) ? overrides[model.key] : model.id;
    if (!present.has(id)) gone.push({ key: model.key, id });
  }
  const candidates = live.models
    .filter((m, i, all) => m && m.tools === true && overrideIdOk(m.id) && all.findIndex((x) => x?.id === m.id) === i)
    .map((m) => ({ id: m.id, name: cleanName(m.name, m.id), forcedFormat: m.forcedFormat === true }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { state: gone.length > 0 ? "gone" : "ok", gone, candidates };
}

// Asks our server for the free models of OpenRouter (no key is needed) and remembers the answer for ttlMs. A failed answer is not
// remembered, so the next trigger asks again.
// run({ force }) -> { ok: true, live: { ids, models }, data, at } | { ok: false, live: null, error, at }; last() -> the latest result or null.
// data is the whole answer of the server (Settings, Check models shows it); error is "unreachable" or "rate_limit".
export function createFreeCheck({ fetchFn = fetch, now = Date.now, ttlMs = 1800000 } = {}) {
  let cached = null;
  let latest = null;
  let pending = null;
  async function ask() {
    let failure = "unreachable";
    try {
      const response = await fetchFn("/api/models", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: "openrouter" }) });
      const data = await response.json();
      if (["rate_limit", "rejected"].includes(data?.error)) failure = data.error;
      if (response.ok && data?.ok === true && Array.isArray(data.freeIds) && data.freeIds.length > 0 && Array.isArray(data.freeModels)) {
        cached = { ok: true, live: { ids: data.freeIds, models: data.freeModels }, data, at: now() };
        latest = cached;
        return cached;
      }
    } catch {
      // unreachable: the answer below says so
      failure = "unreachable";
    }
    latest = { ok: false, live: null, error: failure, at: now() };
    return latest;
  }
  return {
    async run({ force = false } = {}) {
      if (!force && cached !== null && now() - cached.at < ttlMs) return cached;
      pending ??= ask().finally(() => {
        pending = null;
      });
      return pending;
    },
    last: () => latest,
  };
}

// The check the Create and Settings pages share, so a visit to either keeps the answer for 30 minutes.
export const sharedFreeCheck = createFreeCheck();

// A copy of the design in which the agents of the free slot carry the id the student chose for their tier (modelId), and no other id.
// Nodes that need no change are the same objects.
export function applyOverrides(design, overrides) {
  const own = overrides?.[OVERRIDE_SLOT];
  const nodes = (design?.nodes ?? []).map((node) => {
    if (node?.slot !== OVERRIDE_SLOT) return node;
    const id = overrideIdOk(own?.[node.model]) ? own[node.model] : null;
    if (id !== null) return node.modelId === id ? node : { ...node, modelId: id };
    if (!("modelId" in node)) return node;
    const { modelId, ...rest } = node;
    return rest;
  });
  return { ...design, nodes };
}
