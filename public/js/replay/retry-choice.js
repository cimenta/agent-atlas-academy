// Retry with another model: the models a failed agent can be retried with, and a run with that choice applied.
import { providerCatalog, nodeModel, nodeProvider } from "../engine/catalog.js";
import { isSlot, slotIsFree, slotProvider } from "../key-slots.js";

const PROVIDERS = ["anthropic", "google"];

// The key slot a model is run with: Anthropic has one; a Gemini model keeps the slot the agent already has when it fits,
// else the free slot for a model with a free tier and the paid slot for one without.
function slotFor(provider, model, node) {
  if (provider === "anthropic") return "anthropic";
  if (isSlot(node?.slot) && slotProvider(node.slot) === "google" && (model.freeTier !== false || !slotIsFree(node.slot))) return node.slot;
  return model.freeTier === false ? "google" : "google-free";
}

// [{ provider, id, tier, value: { slot, model }, current, free }] for every model, the one that failed marked current.
export function retryChoices(design, nodeId, fallback = "anthropic") {
  const node = design?.nodes?.find((n) => n.id === nodeId);
  const now = nodeModel(node, fallback);
  const nowProvider = nodeProvider(node, fallback);
  const out = [];
  for (const provider of PROVIDERS) {
    for (const model of providerCatalog(provider).models) {
      out.push({
        provider,
        id: model.id,
        tier: model.key,
        value: { slot: slotFor(provider, model, node), model: model.key },
        current: provider === nowProvider && model.id === now.id,
        free: provider === "google" && model.freeTier !== false,
      });
    }
  }
  return out;
}

// A copy of the run in which the agent runs with the chosen model (its own, not the default one), in the recorded design too.
export function withRetryChoice(run, nodeId, choice) {
  const copy = structuredClone(run);
  const apply = (design) => {
    const node = design?.nodes?.find((n) => n.id === nodeId);
    if (node) Object.assign(node, { slot: choice.slot, model: choice.model, custom: true });
  };
  apply(copy.design);
  for (const e of copy.events ?? []) if (e.type === "run_start") apply(e.design);
  const nodes = copy.design?.nodes ?? [];
  if (copy.recordedWith && nodes.length > 0 && nodes.every((n) => isSlot(n.slot))) copy.recordedWith.freeTier = nodes.every((n) => slotIsFree(n.slot));
  return copy;
}
