// Pure helpers for the Play tabs: the list of runs to replay and the numbers on the Result tab.
import { MODELS, SEARCH_PRICE_USD } from "./engine/catalog.js";
import { deriveInspector } from "./replay/inspect-model.js";
import { validateRun } from "./run-schema.js";

// The library run the home page plays: the one marked "home": true in runs/index.json, else the first.
export function pickHomeRun(runs) {
  const list = Array.isArray(runs) ? runs : [];
  return list.find((r) => r?.home === true) ?? list[0];
}

export function buildReplayList(gallery, local) {
  return {
    gallery: gallery.map((r) => ({ id: r.id, title: r.title, pattern: r.pattern, source: "gallery" })),
    mine: [...local]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((r) => ({ id: r.id, title: r.title, pattern: r.pattern, outcome: r.outcome, createdAt: r.createdAt, source: "local" })),
  };
}

export function buildResultModel(run) {
  const events = Array.isArray(run?.events) ? run.events : [];
  const done = [...events].reverse().find((e) => e.type === "done");
  const outputs = events.filter((e) => e.type === "agent_output");

  const byAgent = new Map();
  for (const e of outputs) {
    const entry = byAgent.get(e.agent) ?? { agent: e.agent, input: 0, output: 0 };
    entry.input += Number(e.tokens?.input) || 0;
    entry.output += Number(e.tokens?.output) || 0;
    byAgent.set(e.agent, entry);
  }
  const perAgent = [...byAgent.values()];

  const summed = {
    input: perAgent.reduce((n, a) => n + a.input, 0),
    output: perAgent.reduce((n, a) => n + a.output, 0),
    searches: events.filter((e) => e.type === "tool_call").length,
  };
  const usage = done?.usage
    ? { input: done.usage.input ?? 0, output: done.usage.output ?? 0, searches: done.usage.searches ?? 0 }
    : summed;

  let cost = null;
  if (run?.design && Array.isArray(run.design.nodes)) {
    cost = usage.searches * SEARCH_PRICE_USD;
    for (const a of perAgent) {
      const node = run.design.nodes.find((n) => n.id === a.agent);
      const model = MODELS.find((m) => m.key === node?.model) ?? MODELS[0];
      cost += (a.input * model.inputPerMTok + a.output * model.outputPerMTok) / 1e6;
    }
  }

  return {
    status: done ? (done.outcome ?? "finished") : "interrupted",
    finalText: typeof done?.finalText === "string" && done.finalText !== "" ? done.finalText : (outputs.at(-1)?.text ?? ""),
    usage,
    perAgent,
    cost,
  };
}

// Library search: every word typed must appear in the title, the pattern, the id or a tag.
export function filterLibrary(items, query) {
  const words = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return items;
  return items.filter((item) => {
    const haystack = [item.title, item.pattern, item.id, ...(Array.isArray(item.tags) ? item.tags : [])].join(" ").toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

// The numbers on the Statistics tab: how long the run took, what it cost and what each agent used.
export function buildStatistics(run) {
  const base = buildResultModel(run);
  const events = Array.isArray(run?.events) ? run.events : [];
  const inspector = deriveInspector(events);
  const totalMs = typeof run?.durationMs === "number" ? run.durationMs : (events.at(-1)?.t ?? null);
  const agentMs = inspector.order.reduce((n, id) => n + (inspector.agents[id].ms ?? 0), 0);
  const perAgent = inspector.order
    .filter((id) => inspector.agents[id].startT !== null)
    .map((id) => {
      const a = inspector.agents[id];
      const node = run?.design?.nodes?.find((n) => n.id === id);
      const tokens = base.perAgent.find((x) => x.agent === id);
      return {
        agent: id,
        label: a.label,
        model: a.model || node?.model || "",
        ms: a.ms,
        input: tokens?.input ?? 0,
        output: tokens?.output ?? 0,
        calls: a.rounds.filter((r) => !r.reconstructed).length,
        searches: a.steps.filter((s) => s.kind === "tool").length,
        share: agentMs > 0 && a.ms !== null ? a.ms / agentMs : 0,
      };
    });
  return {
    status: base.status,
    cost: base.cost,
    usage: base.usage,
    totalMs,
    startedAt: run?.startedAt ?? null,
    endedAt: run?.endedAt ?? null,
    appVersion: run?.appVersion ?? null,
    calls: perAgent.reduce((n, a) => n + a.calls, 0),
    perAgent,
  };
}

// A run file chosen for import: it must be JSON that passes the run schema. It always gets a fresh
// id, so importing never replaces an example or one of your own runs.
export function prepareImport(text, makeId) {
  let run;
  try {
    run = JSON.parse(text);
  } catch {
    return { ok: false, reason: "json" };
  }
  if (run === null || typeof run !== "object" || Array.isArray(run)) return { ok: false, reason: "invalid" };
  const copy = { ...run, id: makeId() };
  const check = validateRun(copy);
  return check.ok ? { ok: true, run: copy } : { ok: false, reason: "invalid", errors: check.errors };
}
