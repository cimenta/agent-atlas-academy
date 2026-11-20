// What a run may do to the limits of a free account (Groq, OpenRouter): findings from the design and its estimate, and the offers that remove them.
// Pure: no page, no storage. The estimate is an upper bound; the texts say "may".
import { callsOf, neuronsOf } from "./estimate.js";
import { nodeModel } from "./catalog.js";
import { modelsOfSlot } from "./providers.js";
import { slotFreeLimits, slotProvider, slotIsFree, SLOTS } from "../key-slots.js";
import { TIME_LIMIT_MS } from "./budget.js";

// A run that needs more than this many minutes at the minute limit is called slow; a shorter one only has its calls spaced.
export const SLOW_MINUTES = 3;

const modelIdOf = (node) => nodeModel(node).id;

// The agents that run on a slot with free limits, with their numbers, in buckets: Groq counts for each model, OpenRouter for the whole
// account (perModel: false). A limit that is null (OpenRouter has no token limits) is not checked.
const hasTokens = (free) => free.tpm !== null && free.tpm !== undefined && free.tpd !== null && free.tpd !== undefined;
// A pool of neurons (Cloudflare) counts the size of a call like tokens do: shorter answers help against it, running slowly does not.
const hasPool = (free) => typeof free.neuronsPerDay === "number";
const countsSize = (free) => hasTokens(free) || hasPool(free);
function bucketsOf(design, limits, settings) {
  const rows = new Map(callsOf(design, limits, settings).map((r) => [r.id, r]));
  const buckets = new Map();
  for (const node of design.nodes ?? []) {
    const free = slotFreeLimits(node.slot);
    const row = rows.get(node.id);
    if (!free || !row) continue;
    const key = `${slotProvider(node.slot)}:${free.perModel === false ? "*" : modelIdOf(node)}`;
    const bucket = buckets.get(key) ?? { free, provider: slotProvider(node.slot), account: free.perModel === false, agents: [], calls: 0, total: 0, neurons: 0 };
    const spent = neuronsOf(node, row);
    bucket.agents.push({ id: node.id, calls: row.calls, perCall: row.perCallTokens, neurons: spent });
    bucket.neurons += spent;
    bucket.calls += row.calls;
    bucket.total += row.calls * row.typicalTokens;
    buckets.set(key, bucket);
  }
  return [...buckets.values()];
}

// Finding = { kind: "call-too-big" | "slow" | "day-tokens" | "day-requests", agents: string[], numbers: {...} }.
export function limitFindings({ design, limits, outputTokens, handoffChars }) {
  const buckets = bucketsOf(design, limits, { outputTokens, handoffChars });
  const findings = [];
  const worst = (kind, pick) => {
    let best = null;
    for (const b of buckets) {
      const found = pick(b);
      if (found && (!best || found.ratio > best.ratio)) best = { ...found, provider: b.provider };
    }
    return best ? { kind, provider: best.provider, agents: best.agents, numbers: best.numbers, ...(best.account ? { account: true } : {}) } : null;
  };
  const tooBig = buckets.filter((b) => hasTokens(b.free)).flatMap((b) => b.agents.filter((a) => a.perCall > b.free.tpm).map((a) => ({ id: a.id, perCall: a.perCall, tpm: b.free.tpm })));
  if (tooBig.length > 0) {
    const biggest = tooBig.reduce((a, b) => (b.perCall > a.perCall ? b : a));
    findings.push({ kind: "call-too-big", provider: buckets.find((b) => b.agents.some((a) => a.id === tooBig[0].id))?.provider, agents: tooBig.map((x) => x.id), numbers: { perCall: biggest.perCall, tpm: biggest.tpm } });
  }
  const dayTokens = worst("day-tokens", (b) => (hasTokens(b.free) && b.total > b.free.tpd ? { ratio: b.total / b.free.tpd, agents: b.agents.map((a) => a.id), numbers: { total: b.total, tpd: b.free.tpd } } : null));
  const dayNeurons = worst("day-neurons", (b) => (hasPool(b.free) && b.neurons > b.free.neuronsPerDay ? { ratio: b.neurons / b.free.neuronsPerDay, account: b.account, agents: b.agents.map((a) => a.id), numbers: { neurons: Math.ceil(b.neurons), pool: b.free.neuronsPerDay } } : null));
  const dayRequests = worst("day-requests", (b) => (typeof b.free.rpd === "number" && b.calls > b.free.rpd ? { ratio: b.calls / b.free.rpd, account: b.account, agents: b.agents.map((a) => a.id), numbers: { calls: b.calls, rpd: b.free.rpd } } : null));
  if (dayTokens) findings.push(dayTokens);
  if (dayNeurons) findings.push(dayNeurons);
  if (dayRequests) findings.push(dayRequests);
  if (!dayTokens && !dayRequests) {
    const slow = worst("slow", (b) => {
      // Without token limits only the requests a minute can make a run slow.
      if (!hasTokens(b.free)) {
        if (typeof b.free.rpm !== "number") return null;
        const minutes = Math.ceil(b.calls / b.free.rpm);
        return minutes > SLOW_MINUTES ? { ratio: minutes, account: b.account, agents: b.agents.map((a) => a.id), numbers: { calls: b.calls, rpm: b.free.rpm, minutes } } : null;
      }
      const minutes = Math.ceil(b.total / b.free.tpm);
      return minutes > SLOW_MINUTES ? { ratio: minutes, agents: b.agents.map((a) => a.id), numbers: { total: b.total, tpm: b.free.tpm, minutes } } : null;
    });
    if (slow) findings.push(slow);
  }
  return findings;
}

// The model an agent keeps when it moves to a slot: the same choice when the slot offers it (a free Gemini key has no Strong), else the first it offers.
function modelFor(slot, key) {
  const offered = modelsOfSlot(slot).filter((m) => !slotIsFree(slot) || m.freeTier !== false);
  return offered.some((m) => m.key === key) ? key : (offered.find((m) => m.key === "balanced") ?? offered[0]).key;
}

const freeSlotsIn = (design) => (design.nodes ?? []).filter((n) => slotFreeLimits(n.slot)).map((n) => n.id);
// True when every limited slot of the design counts requests only (OpenRouter): token offers (shorter answers) do not help there.
// Only the agents of the findings count: a Groq agent next to OpenRouter ones does not make a day-requests finding a token one.
const requestsOnly = (design, findings = []) => {
  const hit = new Set(findings.flatMap((f) => f.agents ?? []));
  const nodes = (design.nodes ?? []).filter((n) => slotFreeLimits(n.slot) && (hit.size === 0 || hit.has(n.id)));
  return nodes.every((n) => !countsSize(slotFreeLimits(n.slot)));
};
// The order of the offers when the daily pool of neurons is the limit (the approved mockup).
const POOL_ORDER = ["fewer", "shorter", "lightest-model", "tomorrow", "move-agent", "paid-key"];
// The order of the offers when only requests are limited (the approved mockup).
const REQUESTS_ORDER = ["fewer", "tomorrow", "move-agent", "lightest-only", "slowly", "paid-key"];

// A loaded slot an agent of a free-limited slot can move to: not a slot with free limits itself, and with the agent's model choice.
// When a pool of neurons is the limit, a free slot of another provider counts too (its own findings are checked after the move), and no slot
// of the provider whose pool is hit does (its paid key has its own offer).
const elsewhereList = (loadedSlots, poolProvider) => (loadedSlots ?? []).filter((id) => SLOTS.some((s) => s.id === id) && (poolProvider ? slotProvider(id) !== poolProvider : !slotFreeLimits(id)))
  .sort((a, b) => Number(Boolean(slotFreeLimits(a))) - Number(Boolean(slotFreeLimits(b))));

// Offer = { id, agents?, disabled?, apply(design, settings) -> { design, settings }, after: Finding[] }.
export function limitOffers({ design, limits, outputTokens, handoffChars, loadedSlots }) {
  if (freeSlotsIn(design).length === 0) return [];
  const settings = { outputTokens, handoffChars };
  const findings = limitFindings({ design, limits, ...settings });
  const poolHit = findings.some((f) => f.kind === "day-neurons");
  const hitIds0 = new Set(findings.flatMap((f) => f.agents ?? []));
  const hitNode0 = design.nodes.find((n) => hitIds0.has(n.id) && slotFreeLimits(n.slot)) ?? design.nodes.find((n) => slotFreeLimits(n.slot));
  // Only an offer that changes the design or the settings gets a new estimate: waiting for tomorrow or a paid key leaves the numbers as they are.
  const changes = (offer) => !["tomorrow", "slowly"].includes(offer.id) && offer.disabled !== true;
  const finish = (offer) => {
    const applied = offer.apply(design, settings);
    const estimate = poolHit && changes(offer) ? limitSummary({ design: applied.design, limits, ...applied.settings }) : null;
    return { ...offer, after: limitFindings({ design: applied.design, limits, ...applied.settings }), ...(estimate?.pool ? { estimate: { neurons: Math.ceil(estimate.neurons) } } : {}) };
  };
  const offers = [];
  const candidates = elsewhereList(loadedSlots, poolHit ? slotProvider(hitNode0?.slot) : null);
  const other = candidates[0];
  const rows = callsOf(design, limits, settings);
  const size = (id) => rows.find((r) => r.id === id)?.perCallTokens ?? 0;
  const moveTo = (ids, slot = other) => (d, s) => ({ design: { ...d, nodes: d.nodes.map((n) => (ids.includes(n.id) ? { ...n, slot, model: modelFor(slot, n.model) } : n)) }, settings: s });
  const tooBig = findings.find((f) => f.kind === "call-too-big");
  if (other && tooBig) offers.push(finish({ id: "move-agent", agents: tooBig.agents, slot: other, apply: moveTo(tooBig.agents) }));
  const onlyRequests = requestsOnly(design, findings);
  if (other && findings.length > 0) {
    // The biggest agents leave Groq first, until the rest fits; the lightest stay. With requests only the ones with most calls leave.
    const callsOfAgent = (id) => rows.find((r) => r.id === id)?.calls ?? 0;
    const neuronsOfAgent = (id) => neuronsOf(design.nodes.find((n) => n.id === id), rows.find((r) => r.id === id));
    const order = freeSlotsIn(design).sort((a, b) => (onlyRequests ? callsOfAgent(b) - callsOfAgent(a) : poolHit ? neuronsOfAgent(b) - neuronsOfAgent(a) : size(b) - size(a)));
    search: for (let n = 1; n < order.length; n++) {
      const leaving = order.slice(0, n);
      for (const target of candidates) {
        const moved = moveTo(leaving, target)(design, settings);
        if (limitFindings({ design: moved.design, limits, ...settings }).length === 0) {
          offers.push(onlyRequests || poolHit ? finish({ id: "move-agent", agents: leaving, slot: target, apply: moveTo(leaving, target) }) : finish({ id: "lightest-only", agents: order.slice(n), moved: leaving, slot: target, apply: moveTo(leaving, target) }));
          break search;
        }
      }
    }
  }
  if (findings.length > 0 && !onlyRequests) {
    const shorter = { outputTokens: Math.min(outputTokens ?? 4000, 1500), handoffChars: handoffChars > 0 ? Math.min(handoffChars, 4000) : 4000 };
    if (shorter.outputTokens < (outputTokens ?? 4000) || handoffChars === 0 || handoffChars > 4000) {
      const offer = finish({ id: "shorter", values: shorter, apply: (d, s) => ({ design: d, settings: { ...s, ...shorter } }) });
      // For a pool of neurons an offer that does not lower the estimate changes nothing, so it is not shown.
      const now = poolHit ? Math.ceil(limitSummary({ design, limits, ...settings })?.neurons ?? 0) : null;
      if (!(poolHit && findings.every((f) => f.kind === "day-neurons") && offer.estimate && offer.estimate.neurons >= now)) offers.push(offer);
    }
  }
  // The daily pool of neurons: the same agents on the lightest model use much less of it.
  if (poolHit) {
    const heavy = (design.nodes ?? []).filter((n) => hasPool(slotFreeLimits(n.slot) ?? {}) && n.model !== "fast").map((n) => n.id);
    if (heavy.length > 0) offers.push(finish({ id: "lightest-model", agents: heavy, apply: (d, s) => ({ design: { ...d, nodes: d.nodes.map((n) => (heavy.includes(n.id) ? { ...n, model: "fast", modelId: undefined } : n)) }, settings: s }) }));
  }
  // Keeping the design as it is does not unblock a call that can never fit, so these two are offered only when nothing blocks the run.
  const blocked = findings.some((f) => f.kind === "call-too-big");
  // A run is also stopped by the fixed run time, so running slowly is offered only when it can finish inside it.
  const fitsTime = findings.every((f) => f.kind !== "slow" || f.numbers.minutes * 60000 <= TIME_LIMIT_MS);
  if (!blocked && fitsTime && findings.some((f) => f.kind === "slow" || (!onlyRequests && (f.kind === "day-tokens" || f.kind === "day-requests")))) offers.push(finish({ id: "slowly", apply: (d, s) => ({ design: d, settings: s }) }));
  if (!blocked && findings.some((f) => f.kind === "day-tokens" || f.kind === "day-requests" || f.kind === "day-neurons")) offers.push(finish({ id: "tomorrow", apply: (d, s) => ({ design: d, settings: s }) }));
  if (findings.some((f) => (f.kind === "day-tokens" || f.kind === "day-requests" || f.kind === "day-neurons") && (design.pattern === "voting" || design.pattern === "debate"))) {
    offers.push(finish({ id: "fewer", apply: (d, s) => ({ design: fewer(d), settings: s }) }));
  }
  if (findings.length > 0) {
    // The paid key is the one of the provider whose limit is hit, and only that provider's agents move to it.
    const hitIds = new Set(findings.flatMap((f) => f.agents ?? []));
    const hitNode = design.nodes.find((n) => hitIds.has(n.id) && slotFreeLimits(n.slot)) ?? design.nodes.find((n) => slotFreeLimits(n.slot));
    const hitProvider = slotProvider(hitNode?.slot);
    const paid = SLOTS.find((s) => !s.free && s.provider === hitProvider);
    const loaded = paid ? (loadedSlots ?? []).includes(paid.id) : false;
    const target = freeSlotsIn(design).filter((id) => slotProvider(design.nodes.find((n) => n.id === id)?.slot) === hitProvider);
    offers.push(finish({ id: "paid-key", disabled: !loaded, agents: target, slot: paid?.id ?? null, apply: (d, s) => (loaded ? { design: { ...d, nodes: d.nodes.map((n) => (target.includes(n.id) ? { ...n, slot: paid.id, model: modelFor(paid.id, n.model) } : n)) }, settings: s } : { design: d, settings: s }) }));
  }
  const sorted = onlyRequests ? REQUESTS_ORDER : poolHit && findings.every((f) => f.kind === "day-neurons") ? POOL_ORDER : null;
  return sorted ? offers.sort((a, b) => sorted.indexOf(a.id) - sorted.indexOf(b.id)) : offers;
}

// The neurons each agent on a free pool of neurons may use in a run, by agent id (the numbers of the agents table in Create).
export function neuronsByAgent({ design, limits, outputTokens, handoffChars }) {
  const rows = new Map(callsOf(design, limits, { outputTokens, handoffChars }).map((r) => [r.id, r]));
  const out = new Map();
  for (const node of design.nodes ?? []) {
    const spent = rows.has(node.id) ? neuronsOf(node, rows.get(node.id)) : 0;
    if (spent > 0 && hasPool(slotFreeLimits(node.slot) ?? {})) out.set(node.id, Math.round(spent));
  }
  return out;
}

// One voter or one round less.
function fewer(design) {
  if (design.pattern === "debate" && Number.isInteger(design.rounds) && design.rounds > 1) return { ...design, rounds: design.rounds - 1 };
  const voters = design.nodes.filter((n) => n.agent === "voter");
  if (design.pattern === "voting" && voters.length > 2) {
    const drop = voters[voters.length - 1].id;
    return { ...design, nodes: design.nodes.filter((n) => n.id !== drop), edges: (design.edges ?? []).filter((e) => e.from !== drop && e.to !== drop) };
  }
  return design;
}

export { slotIsFree };

// The numbers behind the "fits" line (and the worst bucket in general): null when no agent runs on a slot with free limits.
export function limitSummary({ design, limits, outputTokens, handoffChars }) {
  const buckets = bucketsOf(design, limits, { outputTokens, handoffChars });
  if (buckets.length === 0) return null;
  // The worst bucket: by the share of the day's tokens, or of the day's requests when the bucket has no token limits.
  const share = (b) => (hasPool(b.free) ? b.neurons / b.free.neuronsPerDay : hasTokens(b.free) ? b.total / b.free.tpd : b.calls / b.free.rpd);
  const worst = buckets.reduce((a, b) => (share(b) > share(a) ? b : a));
  const minutes = Math.max(1, Math.ceil(hasPool(worst.free) ? 1 : hasTokens(worst.free) ? worst.total / worst.free.tpm : worst.calls / worst.free.rpm));
  const pool = hasPool(worst.free) ? { neurons: worst.neurons, pool: worst.free.neuronsPerDay } : { neurons: null, pool: null };
  return { provider: worst.provider, perCall: Math.max(...buckets.flatMap((b) => b.agents.map((a) => a.perCall))), total: worst.total, calls: worst.calls, tpm: worst.free.tpm, tpd: worst.free.tpd, rpd: worst.free.rpd, rpm: worst.free.rpm, minutes, ...pool };
}
