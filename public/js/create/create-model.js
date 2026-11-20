// Pure helpers for the Create page: may the run start, and what is shown in the review box.
import { AGENT_TYPES, TASK_MAX_CHARS, nodeProvider, pricesFor } from "../engine/catalog.js";
import { estimateRun, limitWarning, emptyCriteria } from "../engine/estimate.js";
import { TOOLS } from "../engine/tools.js";
import { isSlot, slotProvider } from "../key-slots.js";
import { PROVIDERS } from "../engine/providers.js";

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

// Like handoffSkipper, for the agents a carried-on run creates again: a creation the earlier try already has (same agent id) and
// as many refusals as the earlier try had are replays and are not recorded a second time.
// The answers that carry on a run. An agent that failed its answer format (a failed second check) is asked again: its two bad
// answers are not replayed, or a Retry would fail the same way without calling the model.
export function withoutFailedFormat(answers, events) {
  const last = new Map();
  for (const e of events) if (e.type === "format_check") last.set(e.agent, e);
  const out = [...answers];
  for (const [agent, e] of last) {
    if (e.ok !== false || e.attempt !== 2) continue;
    for (let dropped = 0, i = out.length - 1; i >= 0 && dropped < 2; i--) {
      if (out[i].agent === agent) {
        out.splice(i, 1);
        dropped += 1;
      }
    }
  }
  return out;
}

// An agent that a guardrail stopped is asked again: the answers of the try that was stopped are not replayed. The stop event says how
// many answers that try used (a format repair adds one); without it one answer (two after a repair) is dropped. A later answer of the
// agent means it went on, so nothing is dropped. A stop on the input has no answer to drop.
export function withoutFailedGuardrail(answers, events) {
  const stopped = new Map();
  for (const e of events) {
    if (e.type === "guardrail_check" && e.action === "stopped" && e.where !== "input") stopped.set(e.agent, e);
    else if (e.type === "agent_output") stopped.delete(e.agent);
  }
  const out = [...answers];
  for (const [agent, e] of stopped) {
    const count = Number.isInteger(e.tries) && e.tries > 0 ? e.tries : e.attempt === 2 ? 2 : 1;
    for (let dropped = 0, i = out.length - 1; i >= 0 && dropped < count; i--) {
      if (out[i].agent === agent) {
        out.splice(i, 1);
        dropped += 1;
      }
    }
  }
  return out;
}

// The answers that carry on a run (Retry, Approve), from the events of the earlier try. A recorded condensing goes with the answer that
// follows it, one with no answer after it (the agent failed after condensing) is carried on alone; the verdicts of reviewing guardrails
// go with the answer they judged. The checks on the input go in an entry of their own ({ inputChecks: true }) because the agent may have
// no answer yet (it failed, or waited for approval); they are carried so none is recorded again and no reviewer is paid for twice.
export function resumeAnswers(base) {
  let answers = [];
  const condensed = new Map();
  const latest = new Map();
  const inputs = new Map();
  const isRecordable = (e) => e.action !== "stopped" && !(e.kind === "reviewer" && !e.tokens);
  for (const e of base) {
    if (e.type === "condense") condensed.set(e.agent, { from: e.from, to: e.to, text: e.text, usage: e.usage, kept: e.kept !== false });
    else if (e.type === "agent_output") {
      const answer = { agent: e.agent, text: e.text, tokens: e.tokens, ...(condensed.has(e.agent) ? { condense: condensed.get(e.agent) } : {}) };
      latest.set(e.agent, answer);
      answers.push(answer);
      condensed.delete(e.agent);
    } else if (e.type === "guardrail_check" && isRecordable(e)) {
      const record = { guardrail: e.guardrail, where: e.where, attempt: e.attempt, ok: e.ok, reason: e.reason, tokens: e.tokens, cost: e.cost, model: e.model };
      if (e.where === "input") inputs.set(e.agent, [...(inputs.get(e.agent) ?? []), record]);
      else if (e.kind === "reviewer" && latest.has(e.agent)) latest.get(e.agent).guardrails = [...(latest.get(e.agent).guardrails ?? []), record];
    }
  }
  answers = withoutFailedFormat(answers, base);
  answers = withoutFailedGuardrail(answers, base);
  for (const [agent, condense] of condensed) answers.push({ agent, pending: true, condense });
  for (const [agent, guardrails] of inputs) answers.push({ agent, inputChecks: true, guardrails });
  return answers;
}

export function createSkipper(base) {
  const made = new Set(base.filter((e) => e.type === "agent_created").map((e) => e.agent));
  let refusals = base.filter((e) => e.type === "agent_refused").length;
  const handoffs = new Map();
  for (const e of base) if (e.type === "handoff_refused") handoffs.set(`${e.from}>${e.to}`, (handoffs.get(`${e.from}>${e.to}`) ?? 0) + 1);
  return (event) => {
    if (event.type === "handoff_refused") {
      const key = `${event.from}>${event.to}`;
      const n = handoffs.get(key) ?? 0;
      if (n === 0) return false;
      handoffs.set(key, n - 1);
      return true;
    }
    if (event.type === "agent_created") return made.has(event.agent);
    if (event.type === "agent_refused" && refusals > 0) {
      refusals -= 1;
      return true;
    }
    return false;
  };
}

// True when an agent runs on a free OpenRouter tier that the check found gone (and the student has not chosen another model for it).
// check: the result of compareFree (it already counts the chosen models).
export function blockedByGoneModel(design, check) {
  if (check?.state !== "gone") return false;
  return (design?.nodes ?? []).some((n) => n.slot === "openrouter-free" && check.gone.some((g) => g.key === n.model));
}

export function canRun({ task, apiKey, editorErrors, keyLocked = false, modelGone = false }) {
  const reasons = [];
  const text = typeof task === "string" ? task.trim() : "";
  if (text === "") reasons.push("noTask");
  else if (text.length > TASK_MAX_CHARS) reasons.push("taskTooLong");
  if (typeof apiKey !== "string" || apiKey === "") reasons.push(keyLocked ? "keyLocked" : "noKey");
  if (Array.isArray(editorErrors) && editorErrors.length > 0) reasons.push("designInvalid");
  if (modelGone) reasons.push("modelGone");
  return { ok: reasons.length === 0, reasons };
}

export function reviewSummary({ design, limits, provider = "anthropic" }) {
  return {
    agents: design.nodes.map((n) => ({ id: n.id, label: n.name || AGENT_TYPES[n.agent]?.label || n.agent, model: n.model, search: n.search })),
    estimate: estimateRun(design, limits, pricesFor(provider)),
    warning: limitWarning(design, limits),
    emptyCriteria: emptyCriteria(design),
    hasSearch: design.nodes.some((n) => n.search === true && TOOLS.web_search.extraFee === true && PROVIDERS[nodeProvider(n, provider)]?.capabilities?.search !== false),
  };
}

// The rows of the agents table in step 3: who the agent is, which provider and model it uses and whether that costs money.
// slotName(slot): the name of the provider, slotIsFree(slot): the key is on a free tier, modelInfo(slot, key): { label, id } of the model,
// fallbackSlot: the slot of an agent that names none (a loaded definition).
export function agentRows({ design, slotName, slotIsFree, modelInfo, fallbackSlot }) {
  return design.nodes.map((n) => {
    const slot = isSlot(n.slot) ? n.slot : fallbackSlot;
    const model = modelInfo(slot, n.model);
    return { id: n.id, label: n.name || AGENT_TYPES[n.agent]?.label || n.agent, slot, provider: slotName(slot), modelLabel: model.label, modelId: model.id, paid: !slotIsFree(slot), search: n.search === true && PROVIDERS[slotProvider(slot)]?.capabilities?.search !== false, custom: n.custom === true };
  });
}

const OUTCOMES = new Set(["finished", "stopped_user", "stopped_limit", "interrupted", "failed", "waiting_approval"]);

const LIMIT_REASONS = new Set(["time", "steps", "tokens", "searches", "cost", "repeat", "agent_steps", "agent_tokens", "agent_searches", "rate_day", "rate_pool"]);

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
