// Settings, Check models: asks our server which models a provider offers to a key, and turns the answer into what the page shows.
// No DOM here. The answer is not stored anywhere.
import { modelsOfSlot } from "./engine/providers.js";
import { SLOT_IDS, slotProvider, slotIsFree } from "./key-slots.js";

const KNOWN_ERRORS = new Set(["rejected", "rate_limit", "bad_key", "bad_provider"]);

// { ok: true, total, ids, catalogFound } or { ok: false, error: "rejected" | "unreachable" | "rate_limit" | "bad_key" | "bad_provider" }.
export async function checkModels({ provider, key, fetchFn = fetch }) {
  try {
    const response = await fetchFn("/api/models", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider, key }) });
    const data = await response.json();
    if (response.ok && data?.ok === true && Number.isFinite(data.total) && Array.isArray(data.ids) && Array.isArray(data.catalogFound)) return { ok: true, total: data.total, ids: data.ids, catalogFound: data.catalogFound };
    return { ok: false, error: KNOWN_ERRORS.has(data?.error) ? data.error : "unreachable" };
  } catch {
    return { ok: false, error: "unreachable" };
  }
}

// What to show for one key slot. A free slot is compared with the models that have a free tier only.
// { state: "ok" | "missing" | "error", total, rows: [{ tier, id, label, available }], missing, others, error? }
export function describeCheck(slotId, result) {
  if (!result?.ok) return { state: "error", total: 0, rows: [], missing: 0, others: 0, error: result?.error ?? "unreachable" };
  const models = modelsOfSlot(slotId).filter((m) => !slotIsFree(slotId) || m.freeTier !== false);
  const rows = [];
  for (const m of models) {
    const same = rows.find((r) => r.id === m.id);
    if (same) same.tiers.push(m.key);
    else rows.push({ tier: m.key, tiers: [m.key], id: m.id, label: m.label, available: result.catalogFound.includes(m.id) });
  }
  const available = rows.filter((r) => r.available).length;
  return { state: available === rows.length ? "ok" : "missing", total: result.total, rows, missing: rows.length - available, others: Math.max(0, result.total - available) };
}

// Checks every key in keys ({ slotId: key or null }), one after the other. A slot without a key is skipped, not an error,
// and a failing key does not stop the others. [{ slot, skipped: true } | { slot, result }] in the order of the slots.
export async function checkAllModels({ keys, fetchFn = fetch }) {
  const out = [];
  for (const slot of SLOT_IDS) {
    const key = keys?.[slot];
    if (typeof key !== "string" || key === "") {
      out.push({ slot, skipped: true });
      continue;
    }
    out.push({ slot, result: await checkModels({ provider: slotProvider(slot), key, fetchFn }) });
  }
  return out;
}
