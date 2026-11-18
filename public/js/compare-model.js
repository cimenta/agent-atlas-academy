// Comparing recorded runs: what is different between them (design, limits, task, ...) and what that did (time, cost, tokens, ...).
// Everything is read from the recordings, so old ones compare too; a figure a recording does not hold is null.
import { runMetrics } from "./replay/context-model.js";

export const MAX_COMPARE = 4;
export const MAX_SIDE = 3;

const LIMIT_KEYS = ["maxSteps", "maxTokens", "maxSearches", "maxCostUsd"];
const AGENT_LIMIT_KEYS = ["maxSteps", "maxTokens", "maxSearches", "maxOutputTokens"];
const same = (values) => values.every((v) => JSON.stringify(v) === JSON.stringify(values[0]));
const nodesOf = (run) => (Array.isArray(run?.design?.nodes) ? run.design.nodes : []);
const finite = (n) => (typeof n === "number" && Number.isFinite(n) ? n : null);

const patternOf = (run) => run?.pattern ?? run?.design?.pattern ?? null;
const notebookOn = (run) => run?.design?.memory?.notebook === true;

// The differences between the runs: only rows whose values are not all equal. values[i] belongs to runs[i]; null means the run has no such thing.
export function differences(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const rows = [];
  const add = (id, kind, values, agent) => {
    if (!same(values)) rows.push({ id, kind, ...(agent ? { agent } : {}), values });
  };
  add("pattern", "pattern", list.map((r) => patternOf(r)));
  add("rounds", "rounds", list.map((r) => finite(r?.design?.rounds)));
  add("task", "task", list.map((r) => (typeof r?.task === "string" ? r.task : null)));
  add("language", "language", list.map((r) => r?.language ?? null));
  add("provider", "provider", list.map((r) => r?.recordedWith?.provider ?? null));
  add("notebook", "notebook", list.map((r) => notebookOn(r)));

  const order = [];
  for (const run of list) for (const n of nodesOf(run)) if (!order.includes(n.id)) order.push(n.id);
  const nodeIn = (run, id) => nodesOf(run).find((n) => n.id === id);
  for (const id of order) {
    const present = list.map((r) => Boolean(nodeIn(r, id)));
    if (!present.every(Boolean)) {
      add(`agentPresence:${id}`, "agentPresence", present, id);
      continue;
    }
    const nodes = list.map((r) => nodeIn(r, id));
    add(`model:${id}`, "model", nodes.map((n) => n.model ?? null), id);
    add(`search:${id}`, "search", nodes.map((n) => n.search === true), id);
    add(`notebookChoice:${id}`, "notebookChoice", list.map((r, i) => (notebookOn(r) ? nodes[i].notebook ?? "both" : null)), id);
    add(`condense:${id}`, "condense", nodes.map((n) => n.condense === true), id);
    for (const key of AGENT_LIMIT_KEYS) add(`agentLimit:${id}:${key}`, "agentLimit", nodes.map((n) => finite(n.limits?.[key])), id);
  }
  for (const key of LIMIT_KEYS) add(`limit:${key}`, "limit", list.map((r) => finite(r?.limits?.[key])));

  const tasks = list.map((r) => (typeof r?.task === "string" ? r.task : null));
  return { tasksDiffer: !same(tasks), rows };
}

function lastT(run) {
  const events = Array.isArray(run?.events) ? run.events : [];
  return finite(events.at(-1)?.t);
}

function metricsOf(run) {
  let m = {};
  try {
    m = runMetrics(run) ?? {};
  } catch {
    m = {};
  }
  const events = Array.isArray(run?.events) ? run.events : [];
  const done = events.some((e) => e?.type === "done");
  return {
    ms: finite(run?.durationMs) ?? finite(m.ms) ?? lastT(run),
    cost: finite(m.cost),
    input: finite(m.input),
    output: finite(m.output),
    steps: finite(m.steps),
    largest: finite(m.largest),
    notes: finite(m.notes),
    saved: finite(m.saved),
    outcome: typeof m.outcome === "string" ? m.outcome : done ? "finished" : "interrupted",
  };
}

const METRIC_KEYS = ["ms", "cost", "input", "output", "steps", "largest", "notes", "saved", "outcome"];

// One row per figure: the value of each run, and for the runs after the first the difference from the first (abs, and pct unless the base is 0 or unknown).
export function metricsRows(runs) {
  const all = (Array.isArray(runs) ? runs : []).map(metricsOf);
  return METRIC_KEYS.map((key) => {
    const values = all.map((m) => m[key]);
    const base = values[0];
    const deltas = values.map((v, i) => {
      if (i === 0 || key === "outcome" || typeof v !== "number" || typeof base !== "number") return null;
      const abs = v - base;
      return { abs, pct: base === 0 ? null : Math.round((abs / base) * 1000) / 10 };
    });
    return { key, values, deltas };
  });
}

// The base against the last run: how much the cost and the time changed (percent, or null), and which differences there are.
export function headline(runs) {
  const list = Array.isArray(runs) ? runs : [];
  const rows = metricsRows(list);
  const last = list.length - 1;
  const pct = (key) => rows.find((r) => r.key === key)?.deltas[last]?.pct ?? null;
  return { cost: pct("cost"), ms: pct("ms"), changed: differences(list).rows.map((r) => r.id) };
}

// The result of a run: the text of its done event, else the last answer of an agent.
export function finalText(run) {
  const events = Array.isArray(run?.events) ? run.events : [];
  const done = [...events].reverse().find((e) => e?.type === "done" && typeof e.finalText === "string" && e.finalText !== "");
  if (done) return done.finalText;
  const out = [...events].reverse().find((e) => e?.type === "agent_output" && typeof e.text === "string");
  return out ? out.text : null;
}
