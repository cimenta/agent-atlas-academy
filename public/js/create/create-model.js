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
