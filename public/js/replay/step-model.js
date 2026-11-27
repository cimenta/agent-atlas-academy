// The steps of a whole run in one list, and for each step what it was given, who did it and where its result went.
// This is the "contract" between agents made visible: it is only assembled from what the recording already holds.
// Pure: no DOM.
import { contextOf } from "./context-model.js";

// Who decided that this step happens.
//   model   the model decided it (a model call, a tool it asked for, a handoff it chose, an agent it created)
//   rule    the harness did it by a fixed rule, with no model involved (a handoff on a fixed path, an approval)
//   harness the harness made it happen as a side check (a format check, a guardrail): the model did not ask for it
export const ORIGINS = ["model", "rule", "harness"];

// In these patterns the agent itself chooses who gets the work next; in the others the path is fixed by the design.
const MODEL_CHOOSES = new Set(["handoff", "router", "supervisor", "planner"]);

export function originOf(step, pattern) {
  if (step.kind === "model" || step.kind === "tool") return "model";
  if (step.kind === "check") return "harness";
  if (step.kind === "handoff") return step.created || step.refused || MODEL_CHOOSES.has(pattern) ? "model" : "rule";
  return "rule";
}

// Every step of every agent, in the order the events happened. Each item keeps where it came from, so a view can open the
// per-agent detail: { id, agent, index, step, origin }.
export function runSteps(state, pattern = null) {
  const items = [];
  for (const agentId of state.order) {
    state.agents[agentId].steps.forEach((step, index) => items.push({ id: `${agentId}:${index}`, agent: agentId, index, step, origin: originOf(step, pattern) }));
  }
  return items.sort((a, b) => (a.step.eventIndex ?? 0) - (b.step.eventIndex ?? 0) || a.index - b.index);
}

// The agents a handoff step reaches: the agent that sends it and the one that gets it.
export const involved = (item) => (item.step.kind === "handoff" ? [...new Set([item.step.from, item.step.to])] : [item.agent]);

// The parts a model call was made of, biggest information first: the instructions, the task, what other agents passed on, the notebook
// and the agent's own earlier messages. Only parts that are present are listed.
const PART_ORDER = ["system", "task", "others", "notebook", "own"];

export function receivedOf(events, state, item, cursor) {
  const step = item.step;
  if (step.kind === "model") {
    const row = contextOf(events, item.agent, cursor).find((r) => r.round === (step.title?.params?.n ?? 1));
    if (!row) return [];
    return PART_ORDER.filter((part) => row.parts[part] > 0).map((part) => ({ part, chars: row.parts[part] }));
  }
  if (step.kind === "handoff") return [{ part: "others", chars: typeof step.output === "string" ? step.output.length : 0 }];
  if (step.kind === "tool") return [{ part: "own", chars: typeof step.input === "string" ? step.input.length : 0 }];
  return [];
}

// Where the result of a step goes: back to the same agent (it goes on with its own messages), to other agents, or out as the answer.
export function passedOf(state, item) {
  const { step, agent } = item;
  if (step.kind === "handoff") return { kind: step.refused ? "nowhere" : "agents", agents: step.refused ? [] : [step.to] };
  if (step.kind === "tool" || step.kind === "check" || step.kind === "approval" || step.kind === "title") return { kind: "self", agents: [] };
  const own = state.agents[agent];
  const lastModel = own.steps.map((s, i) => (s.kind === "model" ? i : -1)).filter((i) => i >= 0).at(-1);
  if (item.index !== lastModel) return { kind: "self", agents: [] };
  const targets = [...new Set(own.steps.filter((s) => s.kind === "handoff" && !s.refused && !s.created).map((s) => s.to))];
  return targets.length > 0 ? { kind: "agents", agents: targets } : { kind: own.status === "done" ? "result" : "self", agents: [] };
}
