// Pure helpers for the Create page: may the run start, and what is shown in the review box.
import { AGENT_TYPES, TASK_MAX_CHARS, pricesFor } from "../engine/catalog.js";
import { estimateRun, limitWarning, emptyCriteria } from "../engine/estimate.js";
import { TOOLS } from "../engine/tools.js";
import { isSlot } from "../key-slots.js";

// keyLocked: a key is saved on this computer but not unlocked yet, so the reason says to unlock it.
// A carried-on run: the earlier try already holds some handoffs, and the new try replays them. This returns a function
// that says true for a replayed handoff (and counts it off) and false for a new one. Counting matters: in a ping-pong the
// same handoff can really happen again.
export function handoffSkipper(base) {
  const left = new Map();
  for (const e of base) if (e.type === "handoff") left.set(`${e.from}>${e.to}>${e.note}`, (left.get(`${e.from}>${e.to}>${e.note}`) ?? 0) + 1);
  return (event) => {
    const key = `${event.from}>${event.to}>${event.note}`;
    const n = left.get(key) ?? 0;
    if (n === 0) return false;
    left.set(key, n - 1);
    return true;
  };
}

export function canRun({ task, apiKey, editorErrors, keyLocked = false }) {
  const reasons = [];
  const text = typeof task === "string" ? task.trim() : "";
  if (text === "") reasons.push("noTask");
  else if (text.length > TASK_MAX_CHARS) reasons.push("taskTooLong");
  if (typeof apiKey !== "string" || apiKey === "") reasons.push(keyLocked ? "keyLocked" : "noKey");
  if (Array.isArray(editorErrors) && editorErrors.length > 0) reasons.push("designInvalid");
  return { ok: reasons.length === 0, reasons };
}

export function reviewSummary({ design, limits, provider = "anthropic" }) {
  return {
    agents: design.nodes.map((n) => ({ id: n.id, label: n.name || AGENT_TYPES[n.agent]?.label || n.agent, model: n.model, search: n.search })),
    estimate: estimateRun(design, limits, pricesFor(provider)),
    warning: limitWarning(design, limits),
    emptyCriteria: emptyCriteria(design),
    hasSearch: design.nodes.some((n) => n.search === true && TOOLS.web_search.extraFee === true),
  };
}

// The rows of the agents table in step 3: who the agent is, which provider and model it uses and whether that costs money.
// slotName(slot): the name of the provider, slotIsFree(slot): the key is on a free tier, modelInfo(slot, key): { label, id } of the model,
// fallbackSlot: the slot of an agent that names none (a loaded definition).
export function agentRows({ design, slotName, slotIsFree, modelInfo, fallbackSlot }) {
  return design.nodes.map((n) => {
    const slot = isSlot(n.slot) ? n.slot : fallbackSlot;
    const model = modelInfo(slot, n.model);
    return { id: n.id, label: n.name || AGENT_TYPES[n.agent]?.label || n.agent, slot, provider: slotName(slot), modelLabel: model.label, modelId: model.id, paid: !slotIsFree(slot), search: n.search === true, custom: n.custom === true };
  });
}

const OUTCOMES = new Set(["finished", "stopped_user", "stopped_limit", "interrupted", "failed", "waiting_approval"]);

const LIMIT_REASONS = new Set(["time", "steps", "tokens", "searches", "cost", "repeat", "agent_steps", "agent_tokens", "agent_searches"]);

// A run stopped at a limit says which one when the done event recorded it; older runs keep the general message.
export function runOutcomeMessageKey(outcome, reason) {
  if (outcome === "stopped_limit" && LIMIT_REASONS.has(reason)) return `run.outcome.stopped_limit.${reason}`;
  return `run.outcome.${OUTCOMES.has(outcome) ? outcome : "failed"}`;
}

export function formatDuration(ms) {
  if (typeof ms !== "number" || !Number.isFinite(ms) || ms < 0) return "";
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

export function formatUsd(usd) {
  if (typeof usd !== "number" || !Number.isFinite(usd)) return "";
  return usd < 0.1 ? usd.toFixed(4) : usd.toFixed(2);
}

// What the notice under a finished run shows next to its message: pass or fail, time and cost.
// Finished is a pass, a stop you asked for or a limit you set is a warning, anything else failed.
export function describeOutcome({ outcome, events, cost }) {
  const level = outcome === "finished" ? "ok" : outcome === "stopped_user" || outcome === "stopped_limit" || outcome === "waiting_approval" ? "warn" : "fail";
  const lastT = Array.isArray(events) ? events.at(-1)?.t : undefined;
  return {
    level,
    icon: { ok: "✓", warn: "!", fail: "✕" }[level],
    durationMs: typeof lastT === "number" && Number.isFinite(lastT) ? lastT : null,
    cost: typeof cost === "number" && Number.isFinite(cost) ? cost : null,
  };
}
