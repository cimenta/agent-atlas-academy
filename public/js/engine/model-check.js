// The list of models a provider offers, cleaned. The list comes from a foreign API, so it is data, never trusted:
// only plain ids are kept, and at most MODEL_LIST_MAX of them are passed on.
import { PROVIDERS, overrideIdOk } from "./providers.js";

export const MODEL_LIST_MAX = 200;
const ID = /^[A-Za-z0-9@._:/-]{1,100}$/;

// { ids: the first valid ids, total: how many valid ids there are, catalogFound: the catalog models of the provider among all of them }.
// catalogFound looks at all valid ids, so the cap never makes a model look missing.
export function cleanModelList(raw, providerId) {
  const seen = new Set();
  if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item !== "string") continue;
      const id = item.startsWith("models/") ? item.slice(7) : item;
      if (ID.test(id)) seen.add(id);
    }
  }
  const all = [...seen];
  const catalog = PROVIDERS[providerId]?.models ?? [];
  // A model with an id for the free slot (OpenRouter) is found by either id.
  const wanted = catalog.flatMap((m) => [m.id, m.freeId]).filter((id) => typeof id === "string");
  return { ids: all.slice(0, MODEL_LIST_MAX), total: all.length, catalogFound: [...new Set(wanted)].filter((id) => seen.has(id)) };
}

export const FREE_MODELS_MAX = 60;
export const FREE_IDS_MAX = 300;
const NAME_MAX = 80;

// The free models of OpenRouter from its detailed list: { freeIds: every free id (the check looks for the three it needs among them),
// freeModels: up to FREE_MODELS_MAX entries { id, name, tools, forcedFormat } for the pick list }. Only ids of a safe shape are kept,
// names lose control characters and are cut, and a name or id that contains the key is dropped.
export function cleanFreeModels(models, key = "") {
  const seen = new Set();
  const kept = [];
  for (const m of Array.isArray(models) ? models : []) {
    if (!m || typeof m !== "object" || !overrideIdOk(m.id) || seen.has(m.id)) continue;
    const name = typeof m.name === "string" ? m.name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, NAME_MAX) : "";
    if (typeof key === "string" && key.length >= 8 && (m.id.includes(key) || name.includes(key))) continue;
    seen.add(m.id);
    kept.push({ id: m.id, name: name === "" ? m.id : name, tools: m.tools === true, forcedFormat: m.forcedFormat === true });
  }
  kept.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { freeIds: kept.slice(0, FREE_IDS_MAX).map((m) => m.id), freeModels: [...kept.filter((m) => m.tools), ...kept.filter((m) => !m.tools)].slice(0, FREE_MODELS_MAX) };
}
