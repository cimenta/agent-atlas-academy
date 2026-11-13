// Turns the events of a live run into a stored run: schema v1 plus a few optional fields.
import { providerCatalog } from "./catalog.js";

const TITLE_MAX = 60;

// The models a design uses, each once, in the order of its agents (for example "claude-haiku-5-5, claude-sonnet-5-5").
// A design without agents gives the default model.
export function modelsUsed(design, provider = "anthropic") {
  const models = providerCatalog(provider).models;
  const ids = [];
  for (const node of design?.nodes ?? []) {
    const id = (models.find((m) => m.key === node.model) ?? models[0]).id;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids.length > 0 ? ids.join(", ") : models[0].id;
}

export function titleFromTask(task) {
  const first = String(task ?? "").trim().split(/\r?\n/)[0].trim();
  if (first === "") return "Untitled run";
  return first.length > TITLE_MAX ? `${first.slice(0, TITLE_MAX)}…` : first;
}

export function makeRunId(now, random = Math.random) {
  const stamp = Math.floor(now).toString(36);
  const salt = Math.floor(random() * 36 ** 4).toString(36).padStart(4, "0");
  return `local-${stamp}-${salt}`;
}

function sumUsage(events) {
  const usage = { input: 0, output: 0, searches: 0, steps: 0 };
  for (const event of events) {
    if (event.type === "agent_output") {
      usage.input += Number(event.tokens?.input) || 0;
      usage.output += Number(event.tokens?.output) || 0;
      usage.steps += 1;
    }
    if (event.type === "tool_call") usage.searches += 1;
  }
  return usage;
}

export function buildRunRecord({ id, design, task, events, limits, language, appVersion, startedAt, endedAt, client, provider = "anthropic", freeTier = false }) {
  const done = [...events].reverse().find((e) => e.type === "done");
  return {
    schemaVersion: 1,
    id,
    title: titleFromTask(task),
    language,
    pattern: design.pattern,
    recordedWith: { provider, model: modelsUsed(design, provider), ...(freeTier === true ? { freeTier: true } : {}) },
    appVersion,
    events: [...events],
    design,
    task,
    limits,
    outcome: done?.outcome ?? "interrupted",
    usage: done?.usage ?? sumUsage(events),
    source: "local",
    ...(typeof startedAt === "number" ? { startedAt: new Date(startedAt).toISOString() } : {}),
    ...(typeof endedAt === "number" ? { endedAt: new Date(endedAt).toISOString() } : {}),
    ...(typeof startedAt === "number" && typeof endedAt === "number" ? { durationMs: endedAt - startedAt } : {}),
    ...(client ? { client } : {}),
  };
}
