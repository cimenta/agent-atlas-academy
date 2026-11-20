// The list of models a provider offers, cleaned. The list comes from a foreign API, so it is data, never trusted:
// only plain ids are kept, and at most MODEL_LIST_MAX of them are passed on.
import { PROVIDERS } from "./providers.js";

export const MODEL_LIST_MAX = 200;
const ID = /^[A-Za-z0-9._:/-]{1,100}$/;

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
  return { ids: all.slice(0, MODEL_LIST_MAX), total: all.length, catalogFound: catalog.map((m) => m.id).filter((id) => seen.has(id)) };
}
