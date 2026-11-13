// A rough upper-bound cost for a run, shown before the visitor presses Run.
import { MODELS, SEARCH_PRICE_USD, PRICES_AS_OF } from "./catalog.js";
import { clampLimits } from "./patterns.js";

export const TOKENS_PER_ACTIVATION = 3000;

export function activationsOf(design, limits) {
  const { maxSteps } = clampLimits(limits);
  const nodes = design.nodes;
  if (design.pattern === "debate") {
    const debaters = nodes.filter((n) => n.agent === "debater").length;
    return debaters * design.rounds + 1;
  }
  if (design.pattern === "supervisor") {
    const workers = nodes.filter((n) => n.agent !== "supervisor").length;
    return Math.min(maxSteps, 2 * workers + 2);
  }
  return nodes.length;
}

export function estimateRun(design, limits, prices = { models: MODELS, search: SEARCH_PRICE_USD, pricesAsOf: PRICES_AS_OF }) {
  const clamped = clampLimits(limits);
  const activations = activationsOf(design, clamped);
  const tokensUpper = Math.min(clamped.maxTokens, activations * TOKENS_PER_ACTIVATION);
  const used = design.nodes.map((n) => prices.models.find((m) => m.key === n.model)).filter(Boolean);
  const dearest = used.reduce((a, b) => (b.inputPerMTok + b.outputPerMTok > a.inputPerMTok + a.outputPerMTok ? b : a), used[0] ?? prices.models[0]);
  const costUsd = (tokensUpper / 2) * dearest.inputPerMTok / 1e6 + (tokensUpper / 2) * dearest.outputPerMTok / 1e6;
  const searchCostUsd = design.nodes.some((n) => n.search === true) ? clamped.maxSearches * prices.search : 0;
  return { activations, tokensUpper, costUsd, searchCostUsd, totalUsd: costUsd + searchCostUsd, pricesAsOf: prices.pricesAsOf ?? PRICES_AS_OF };
}
