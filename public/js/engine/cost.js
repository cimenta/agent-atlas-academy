// What the tokens and searches of one provider call cost, in US dollars, by the prices in the catalog.
// An agent on a key of Google's free tier costs nothing. freeTier says the whole run is on such a key, for an agent
// that names no key slot of its own.
import { nodeModel, nodeProvider, providerCatalog } from "./catalog.js";
import { isSlot, slotIsFree } from "../key-slots.js";

const n = (value) => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0);

export function usageCostUsd({ input, output, searches } = {}, node, { provider = "anthropic", freeTier = false } = {}) {
  if (isSlot(node?.slot) ? slotIsFree(node.slot) : freeTier === true) return 0;
  const model = nodeModel(node, provider);
  const search = providerCatalog(nodeProvider(node, provider)).searchPriceUsd;
  return (n(input) * model.inputPerMTok + n(output) * model.outputPerMTok) / 1e6 + n(searches) * search;
}
