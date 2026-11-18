// Pure helpers for the Play tabs: the list of runs to replay and the numbers on the Result tab.
import { providerCatalog, paidOnlyModelUsed, nodeModel } from "./engine/catalog.js";
import { slotIsFree } from "./key-slots.js";
import { deriveInspector } from "./replay/inspect-model.js";
import { validateRun } from "./run-schema.js";
import { clampLimits } from "./engine/patterns.js";
import { TIME_LIMIT_MS } from "./engine/budget.js";

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
      .map((r) => ({ id: r.id, title: r.title, pattern: r.pattern, outcome: r.outcome, provider: r.provider, createdAt: r.createdAt, source: "local" })),
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

  // Prices are the ones of the provider the run was recorded with; a key on the free tier makes the run free.
  // A run that mixed providers has them joined with a plus sign; each agent is then priced by its own slot.
  const provider = String(run?.recordedWith?.provider ?? "").split("+")[0];
  const catalog = providerCatalog(provider);
  const free = run?.recordedWith?.freeTier === true && Array.isArray(run?.design?.nodes) && !paidOnlyModelUsed(run.design, provider);
  let cost = null;
  if (run?.design && Array.isArray(run.design.nodes)) {
    cost = usage.searches * catalog.searchPriceUsd;
    // The extra calls of condensing are priced with the fast model of the agent's provider.
    for (const e of events) {
      if (e.type !== "condense") continue;
      const node = run.design.nodes.find((n) => n.id === e.agent);
      if (slotIsFree(node?.slot)) continue;
      const fast = nodeModel({ ...(node ?? {}), model: "fast" }, provider);
      cost += ((Number(e.usage?.input) || 0) * fast.inputPerMTok + (Number(e.usage?.output) || 0) * fast.outputPerMTok) / 1e6;
    }
    for (const a of perAgent) {
      const node = run.design.nodes.find((n) => n.id === a.agent);
      // An agent that ran on a key of the free tier cost nothing, whatever the list price of its model.
      if (slotIsFree(node?.slot)) continue;
      const model = nodeModel(node, provider);
      cost += (a.input * model.inputPerMTok + a.output * model.outputPerMTok) / 1e6;
    }
  }

  return {
    status: done ? (done.outcome ?? "finished") : "interrupted",
    finalText: typeof done?.finalText === "string" && done.finalText !== "" ? done.finalText : (outputs.at(-1)?.text ?? ""),
    usage,
    perAgent,
    cost,
    free,
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
        limits: node?.limits && Object.keys(node.limits).length > 0 ? node.limits : null,
        onLimit: node?.onLimit === "pass" ? "pass" : "stop",
        hit: events.filter((e) => e.type === "warning" && e.agent === id && typeof e.limit === "string" && e.limit.startsWith("agent_")).map((e) => e.limit),
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
    free: base.free,
    usage: base.usage,
    totalMs,
    startedAt: run?.startedAt ?? null,
    endedAt: run?.endedAt ?? null,
    appVersion: run?.appVersion ?? null,
    calls: perAgent.reduce((n, a) => n + a.calls, 0),
    // The limits the run had, and the limit of the run (not of an agent) that stopped it, if one did.
    runLimits: run?.limits !== null && typeof run?.limits === "object" && !Array.isArray(run.limits) ? clampLimits(run.limits) : null,
    runHit: events.find((e) => e.type === "warning" && typeof e.limit === "string" && !e.limit.startsWith("agent_"))?.limit ?? null,
    perAgent,
  };
}

// The rows of the limits table: the whole run first, then each agent, with what was used, the limit it is held to
// (its own, else the one of the run), where that limit comes from, and whether it was reached.
export function limitRows(stats) {
  const run = stats?.runLimits ?? null;
  const cell = (used, limit, from, hit) => ({ used, limit, from, hit });
  const seconds = typeof stats?.totalMs === "number" ? Math.round(stats.totalMs / 1000) : null;
  const rows = [
    {
      id: "run",
      label: "",
      own: false,
      cells: {
        steps: cell(stats?.calls ?? 0, run?.maxSteps ?? null, "run", stats?.runHit === "steps"),
        tokens: cell((stats?.usage?.input ?? 0) + (stats?.usage?.output ?? 0), run?.maxTokens ?? null, "run", stats?.runHit === "tokens"),
        searches: cell(stats?.usage?.searches ?? 0, run?.maxSearches ?? null, "run", stats?.runHit === "searches"),
        time: cell(seconds, TIME_LIMIT_MS / 1000, "run", stats?.runHit === "time"),
        ...(run?.maxCostUsd ? { cost: cell(stats?.cost ?? 0, run.maxCostUsd, "run", stats?.runHit === "cost") } : {}),
      },
    },
  ];
  for (const a of stats?.perAgent ?? []) {
    const pick = (key, used, hitKey) => {
      const own = a.limits?.[key];
      return cell(used, own ?? run?.[key] ?? null, own !== undefined ? "agent" : "run", Array.isArray(a.hit) && a.hit.includes(hitKey));
    };
    rows.push({
      id: a.agent,
      label: a.label,
      own: a.limits !== null && a.limits !== undefined,
      onLimit: a.onLimit,
      cells: {
        steps: pick("maxSteps", a.calls, "agent_steps"),
        tokens: pick("maxTokens", a.input + a.output, "agent_tokens"),
        searches: pick("maxSearches", a.searches, "agent_searches"),
      },
    });
  }
  return rows;
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

// The date and time of a run as shown on its row in the library, in the visitor's language. Empty when unknown.
export function formatRunWhen(ms, lang) {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "";
  try {
    return date.toLocaleString(lang, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return date.toLocaleString();
  }
}
