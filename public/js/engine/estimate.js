// A rough upper-bound cost for a run, shown before the visitor presses Run.
import { MODELS, SEARCH_PRICE_USD, PRICES_AS_OF, pricesFor } from "./catalog.js";
import { isSlot, slotProvider } from "../key-slots.js";
import { clampLimits } from "./patterns.js";

export const TOKENS_PER_ACTIVATION = 3000;

import { mayCondense } from "./condense.js";

const CAPPED = ["router", "voting", "handoff", "supervisor", "mapreduce", "planexec"];

// Condensing calls: one for each activation of an agent that condenses and receives material (debaters once a round, a supervisor's
// worker once for each instruction it may get). A router, voting or handoff run and an evaluator loop have none.
function condensesOf(design) {
  const rounds = Number.isFinite(design.rounds) ? design.rounds : 1;
  let calls = 0;
  for (const n of design.nodes) {
    if (n.condense !== true || !mayCondense(n.agent, design.pattern)) continue;
    if (design.pattern === "debate") calls += n.agent === "debater" ? rounds : 1;
    else if (design.pattern === "supervisor") calls += 2;
    else if (design.pattern === "sequential" || design.pattern === "parallel" || design.pattern === "mapreduce") calls += 1;
  }
  return calls;
}

// Every agent that condenses its input makes one more call each time it runs.
export function activationsOf(design, limits) {
  const total = runsOf(design, { ...limits, maxSteps: 1e9 }) + condensesOf(design);
  return CAPPED.includes(design.pattern) ? Math.min(clampLimits(limits).maxSteps, total) : total;
}

function runsOf(design, limits) {
  const { maxSteps } = clampLimits(limits);
  const nodes = design.nodes;
  if (design.pattern === "debate") {
    const debaters = nodes.filter((n) => n.agent === "debater").length;
    return debaters * design.rounds + 1;
  }
  if (design.pattern === "evaluator") return 2 * design.rounds;
  // The path depends on the agents' choices; two turns for each agent is a typical upper estimate.
  // The router once (a second time after one repair) and the chosen specialist once: three at most.
  if (design.pattern === "router") return Math.min(maxSteps, 3);
  // Every voter once, the tally once (a second time after one repair).
  if (design.pattern === "voting") return Math.min(maxSteps, nodes.length + 1);
  // The splitter (once, a second time after one repair), up to six workers and the reducer.
  if (design.pattern === "mapreduce") return Math.min(maxSteps, 9);
  // The planner (once, a second time after one repair) and up to six steps.
  if (design.pattern === "planexec") return Math.min(maxSteps, 8);
  if (design.pattern === "handoff") return Math.min(maxSteps, 2 * nodes.length);
  if (design.pattern === "supervisor") {
    // Agents the supervisor may create count as workers: the estimate assumes every allowed one is made and used.
    const workers = nodes.filter((n) => n.agent !== "supervisor").length + nodes.reduce((sum, n) => sum + (n.creates?.max ?? 0), 0);
    return Math.min(maxSteps, 2 * workers + 2);
  }
  return nodes.length;
}

export function estimateRun(design, limits, prices = { models: MODELS, search: SEARCH_PRICE_USD, pricesAsOf: PRICES_AS_OF }) {
  const clamped = clampLimits(limits);
  const activations = activationsOf(design, clamped);
  const tokensUpper = Math.min(clamped.maxTokens, activations * TOKENS_PER_ACTIVATION);
  // An agent with its own key slot is priced by that slot's provider; the others by `prices`.
  const pricesOf = (n) => (isSlot(n.slot) ? pricesFor(slotProvider(n.slot)) : prices);
  const used = design.nodes.map((n) => pricesOf(n).models.find((m) => m.key === n.model)).filter(Boolean);
  const dearest = used.reduce((a, b) => (b.inputPerMTok + b.outputPerMTok > a.inputPerMTok + a.outputPerMTok ? b : a), used[0] ?? prices.models[0]);
  const costUsd = (tokensUpper / 2) * dearest.inputPerMTok / 1e6 + (tokensUpper / 2) * dearest.outputPerMTok / 1e6;
  // Agents created with the search switch on are searchers too, priced like their creator.
  const searchers = design.nodes.filter((n) => n.search === true || n.creates?.search === true);
  const searchCostUsd = searchers.length > 0 ? clamped.maxSearches * Math.max(...searchers.map((n) => pricesOf(n).search)) : 0;
  return { activations, tokensUpper, costUsd, searchCostUsd, totalUsd: costUsd + searchCostUsd, pricesAsOf: prices.pricesAsOf ?? PRICES_AS_OF };
}

// A design that will probably reach a limit of the run: the turns or tokens it needs are more than the limits allow.
// Returns null when it should fit, else what it needs and what the limits are.
export function limitWarning(design, limits) {
  const clamped = clampLimits(limits);
  const turns = activationsOf(design, { ...clamped, maxSteps: 1e9 });
  const tokens = turns * TOKENS_PER_ACTIVATION;
  const steps = turns > clamped.maxSteps;
  const over = tokens > clamped.maxTokens;
  if (!steps && !over) return null;
  return { turns, tokens, maxSteps: clamped.maxSteps, maxTokens: clamped.maxTokens, steps, tokensOver: over };
}

// An evaluator loop without criteria: the evaluator judges by the task alone. Create warns before the run.
export function emptyCriteria(design) {
  return design?.pattern === "evaluator" && (typeof design.criteria !== "string" || design.criteria.trim() === "");
}
