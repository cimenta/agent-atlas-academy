// What a run may do to the limits of a free account (Groq): findings from the design and its estimate, and the offers that remove them.
// Pure: no page, no storage. The estimate is an upper bound; the texts say "may".
import { callsOf } from "./estimate.js";
import { providerCatalog } from "./catalog.js";
import { slotFreeLimits, slotProvider, slotIsFree, SLOTS } from "../key-slots.js";
import { TIME_LIMIT_MS } from "./budget.js";

// A run that needs more than this many minutes at the minute limit is called slow; a shorter one only has its calls spaced.
export const SLOW_MINUTES = 3;

const modelIdOf = (node) => providerCatalog(slotProvider(node.slot)).models.find((m) => m.key === node.model)?.id ?? node.model;

// The agents that run on a slot with free limits, with their numbers, in buckets: Groq counts for each model, for the whole account.
function bucketsOf(design, limits, settings) {
  const rows = new Map(callsOf(design, limits, settings).map((r) => [r.id, r]));
  const buckets = new Map();
  for (const node of design.nodes ?? []) {
    const free = slotFreeLimits(node.slot);
    const row = rows.get(node.id);
    if (!free || !row) continue;
    const key = `${slotProvider(node.slot)}:${modelIdOf(node)}`;
    const bucket = buckets.get(key) ?? { free, agents: [], calls: 0, total: 0 };
    bucket.agents.push({ id: node.id, calls: row.calls, perCall: row.perCallTokens });
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
      if (found && (!best || found.ratio > best.ratio)) best = found;
    }
    return best ? { kind, agents: best.agents, numbers: best.numbers } : null;
  };
  const tooBig = buckets.flatMap((b) => b.agents.filter((a) => a.perCall > b.free.tpm).map((a) => ({ id: a.id, perCall: a.perCall, tpm: b.free.tpm })));
  if (tooBig.length > 0) {
    const biggest = tooBig.reduce((a, b) => (b.perCall > a.perCall ? b : a));
    findings.push({ kind: "call-too-big", agents: tooBig.map((x) => x.id), numbers: { perCall: biggest.perCall, tpm: biggest.tpm } });
  }
  const dayTokens = worst("day-tokens", (b) => (b.total > b.free.tpd ? { ratio: b.total / b.free.tpd, agents: b.agents.map((a) => a.id), numbers: { total: b.total, tpd: b.free.tpd } } : null));
  const dayRequests = worst("day-requests", (b) => (b.calls > b.free.rpd ? { ratio: b.calls / b.free.rpd, agents: b.agents.map((a) => a.id), numbers: { calls: b.calls, rpd: b.free.rpd } } : null));
  if (dayTokens) findings.push(dayTokens);
  if (dayRequests) findings.push(dayRequests);
  if (!dayTokens && !dayRequests) {
    const slow = worst("slow", (b) => {
      const minutes = Math.ceil(b.total / b.free.tpm);
      return minutes > SLOW_MINUTES ? { ratio: minutes, agents: b.agents.map((a) => a.id), numbers: { total: b.total, tpm: b.free.tpm, minutes } } : null;
    });
    if (slow) findings.push(slow);
  }
  return findings;
}

// The model an agent keeps when it moves to a slot: the same choice when the slot offers it (a free Gemini key has no Strong), else the first it offers.
function modelFor(slot, key) {
  const offered = providerCatalog(slotProvider(slot)).models.filter((m) => !slotIsFree(slot) || m.freeTier !== false);
  return offered.some((m) => m.key === key) ? key : (offered.find((m) => m.key === "balanced") ?? offered[0]).key;
}

const freeSlotsIn = (design) => (design.nodes ?? []).filter((n) => slotFreeLimits(n.slot)).map((n) => n.id);

// A loaded slot an agent of a free-limited slot can move to: not a slot with free limits itself, and with the agent's model choice.
const elsewhere = (loadedSlots) => (loadedSlots ?? []).find((id) => !slotFreeLimits(id) && SLOTS.some((s) => s.id === id));

// Offer = { id, agents?, disabled?, apply(design, settings) -> { design, settings }, after: Finding[] }.
export function limitOffers({ design, limits, outputTokens, handoffChars, loadedSlots }) {
  if (freeSlotsIn(design).length === 0) return [];
  const settings = { outputTokens, handoffChars };
  const findings = limitFindings({ design, limits, ...settings });
  const finish = (offer) => {
    const applied = offer.apply(design, settings);
    return { ...offer, after: limitFindings({ design: applied.design, limits, ...applied.settings }) };
  };
  const offers = [];
  const other = elsewhere(loadedSlots);
  const rows = callsOf(design, limits, settings);
  const size = (id) => rows.find((r) => r.id === id)?.perCallTokens ?? 0;
  const moveTo = (ids) => (d, s) => ({ design: { ...d, nodes: d.nodes.map((n) => (ids.includes(n.id) ? { ...n, slot: other, model: modelFor(other, n.model) } : n)) }, settings: s });
  const tooBig = findings.find((f) => f.kind === "call-too-big");
  if (other && tooBig) offers.push(finish({ id: "move-agent", agents: tooBig.agents, slot: other, apply: moveTo(tooBig.agents) }));
  if (other && findings.length > 0) {
    // The biggest agents leave Groq first, until the rest fits; the lightest stay.
    const order = freeSlotsIn(design).sort((a, b) => size(b) - size(a));
    for (let n = 1; n < order.length; n++) {
      const leaving = order.slice(0, n);
      const moved = moveTo(leaving)(design, settings);
      if (limitFindings({ design: moved.design, limits, ...settings }).length === 0) {
        offers.push(finish({ id: "lightest-only", agents: order.slice(n), moved: leaving, slot: other, apply: moveTo(leaving) }));
        break;
      }
    }
  }
  if (findings.length > 0) {
    const shorter = { outputTokens: Math.min(outputTokens ?? 4000, 1500), handoffChars: handoffChars > 0 ? Math.min(handoffChars, 4000) : 4000 };
    if (shorter.outputTokens < (outputTokens ?? 4000) || handoffChars === 0 || handoffChars > 4000) offers.push(finish({ id: "shorter", values: shorter, apply: (d, s) => ({ design: d, settings: { ...s, ...shorter } }) }));
  }
  // Keeping the design as it is does not unblock a call that can never fit, so these two are offered only when nothing blocks the run.
  const blocked = findings.some((f) => f.kind === "call-too-big");
  // A run is also stopped by the fixed run time, so running slowly is offered only when it can finish inside it.
  const fitsTime = findings.every((f) => f.kind !== "slow" || f.numbers.minutes * 60000 <= TIME_LIMIT_MS);
  if (!blocked && fitsTime && findings.some((f) => f.kind === "slow" || f.kind === "day-tokens" || f.kind === "day-requests")) offers.push(finish({ id: "slowly", apply: (d, s) => ({ design: d, settings: s }) }));
  if (!blocked && findings.some((f) => f.kind === "day-tokens" || f.kind === "day-requests")) offers.push(finish({ id: "tomorrow", apply: (d, s) => ({ design: d, settings: s }) }));
  if (findings.some((f) => (f.kind === "day-tokens" || f.kind === "day-requests") && (design.pattern === "voting" || design.pattern === "debate"))) {
    offers.push(finish({ id: "fewer", apply: (d, s) => ({ design: fewer(d), settings: s }) }));
  }
  if (findings.length > 0) {
    const paid = SLOTS.find((s) => !s.free && s.provider === slotProvider(design.nodes.find((n) => slotFreeLimits(n.slot))?.slot));
    const loaded = paid ? (loadedSlots ?? []).includes(paid.id) : false;
    const target = freeSlotsIn(design);
    offers.push(finish({ id: "paid-key", disabled: !loaded, agents: target, slot: paid?.id ?? null, apply: (d, s) => (loaded ? { design: { ...d, nodes: d.nodes.map((n) => (target.includes(n.id) ? { ...n, slot: paid.id, model: modelFor(paid.id, n.model) } : n)) }, settings: s } : { design: d, settings: s }) }));
  }
  return offers;
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
  const worst = buckets.reduce((a, b) => (b.total / b.free.tpd > a.total / a.free.tpd ? b : a));
  return { perCall: Math.max(...buckets.flatMap((b) => b.agents.map((a) => a.perCall))), total: worst.total, calls: worst.calls, tpm: worst.free.tpm, tpd: worst.free.tpd, rpd: worst.free.rpd, minutes: Math.max(1, Math.ceil(worst.total / worst.free.tpm)) };
}
