// Pure helpers for the Create page: may the run start, and what is shown in the review box.
import { AGENT_TYPES, TASK_MAX_CHARS } from "../engine/catalog.js";
import { estimateRun } from "../engine/estimate.js";
import { TOOLS } from "../engine/tools.js";

export function canRun({ task, apiKey, editorErrors }) {
  const reasons = [];
  const text = typeof task === "string" ? task.trim() : "";
  if (text === "") reasons.push("noTask");
  else if (text.length > TASK_MAX_CHARS) reasons.push("taskTooLong");
  if (typeof apiKey !== "string" || apiKey === "") reasons.push("noKey");
  if (Array.isArray(editorErrors) && editorErrors.length > 0) reasons.push("designInvalid");
  return { ok: reasons.length === 0, reasons };
}

export function reviewSummary({ design, limits }) {
  return {
    agents: design.nodes.map((n) => ({ id: n.id, label: n.name || AGENT_TYPES[n.agent]?.label || n.agent, model: n.model, search: n.search })),
    estimate: estimateRun(design, limits),
    hasSearch: design.nodes.some((n) => n.search === true && TOOLS.web_search.extraFee === true),
  };
}

const OUTCOMES = new Set(["finished", "stopped_user", "stopped_limit", "interrupted", "failed"]);

export function runOutcomeMessageKey(outcome) {
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
  const level = outcome === "finished" ? "ok" : outcome === "stopped_user" || outcome === "stopped_limit" ? "warn" : "fail";
  const lastT = Array.isArray(events) ? events.at(-1)?.t : undefined;
  return {
    level,
    icon: { ok: "✓", warn: "!", fail: "✕" }[level],
    durationMs: typeof lastT === "number" && Number.isFinite(lastT) ? lastT : null,
    cost: typeof cost === "number" && Number.isFinite(cost) ? cost : null,
  };
}
