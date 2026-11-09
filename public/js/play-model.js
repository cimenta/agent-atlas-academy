// Pure helpers for the Play tabs: the list of runs to replay and the numbers on the Result tab.
import { MODELS, SEARCH_PRICE_USD } from "./engine/catalog.js";

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
