// A rough upper-bound cost for a run, shown before the visitor presses Run.
import { MODELS, SEARCH_PRICE_USD, PRICES_AS_OF, pricesFor, nodeModel } from "./catalog.js";
import { isSlot, slotProvider } from "../key-slots.js";
import { resolveModel } from "./providers.js";
import { clampLimits } from "./patterns.js";

export const TOKENS_PER_ACTIVATION = 3000;

import { mayCondense } from "./condense.js";
import { validFormat, mayFormat } from "./format.js";
import { validGuardrails, mayGuard } from "./guardrails.js";

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

// An agent with an answer format may need one repair call (the worst case).
const formatsOf = (design) => design.nodes.filter((n) => validFormat(n.format) && mayFormat(n.agent, design.pattern)).length;

// A reviewing guardrail is one call; an agent that may be asked to try again by a guardrail needs one more (the worst case).
const guardrailCallsOf = (design) =>
  design.nodes.reduce((sum, n) => {
    if (!validGuardrails(n.guardrails) || !mayGuard(n.agent, design.pattern)) return sum;
    return sum + n.guardrails.filter((g) => g.kind === "reviewer").length + (n.guardrails.some((g) => g.onFail === "repair") ? 1 : 0);
  }, 0);

// Every agent that condenses its input makes one more call each time it runs.
export function activationsOf(design, limits) {
  const total = runsOf(design, { ...limits, maxSteps: 1e9 }) + condensesOf(design) + formatsOf(design) + guardrailCallsOf(design);
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
  // A free slot with ids of its own (OpenRouter) costs nothing: the model is read as the slot sees it.
  const used = design.nodes.map((n) => resolveModel(isSlot(n.slot) ? n.slot : null, pricesOf(n).models.find((m) => m.key === n.model))).filter(Boolean);
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

// How many provider calls each agent may make, and how big one call may be, for the limits of a free account.
// perCallTokens: 300 for the instructions, a quarter of the characters the agent reads (the task, and what each agent before it hands on),
// and the longest answer it may give (a call reserves it). typicalTokens counts a typical answer instead (at most 1,500 tokens).
// The sum is an upper bound the owner's real 429 test will tune.
export function callsOf(design, limits, { outputTokens = 4000, handoffChars = 0, taskChars = 1000 } = {}) {
  const nodes = design.nodes ?? [];
  const rounds = Number.isFinite(design.rounds) ? design.rounds : 1;
  const base = nodes.map((n) => (design.pattern === "evaluator" ? rounds : design.pattern === "debate" && n.agent === "debater" ? rounds : 1));
  const total = Math.max(1, activationsOf(design, limits));
  const weight = base.reduce((a, b) => a + b, 0) || 1;
  const cap = Math.max(1, Math.min(Number(outputTokens) || 4000, 4000));
  const typical = Math.min(cap, 1500);
  const upstreamChars = Math.min(handoffChars > 0 ? handoffChars : typical * 4, typical * 4);
  return nodes.map((n, i) => {
    const incoming = (design.edges ?? []).filter((e) => e.to === n.id).length;
    const input = 300 + Math.ceil((Math.min(taskChars, 1000) + incoming * upstreamChars) / 4);
    // An agent's own lower answer limit counts, as the agent enforces it.
    const own = Math.max(1, Math.min(cap, Number(n.limits?.maxOutputTokens) || cap));
    const output = Math.min(typical, own);
    return { id: n.id, calls: Math.max(1, Math.ceil((base[i] * total) / weight)), perCallTokens: input + own, typicalTokens: input + output, inputTokens: input, outputTokens: output };
  });
}

// The neurons an agent may use in a run (Cloudflare counts its free pool in neurons): its calls times the typical tokens of a call by the
// neuron rates of its model. 0 for a model that has no rates.
export function neuronsOf(node, row) {
  const model = nodeModel(node);
  if (typeof model.neuronsInPerM !== "number" || typeof model.neuronsOutPerM !== "number" || !row) return 0;
  return (row.calls * (row.inputTokens * model.neuronsInPerM + row.outputTokens * model.neuronsOutPerM)) / 1e6;
}
