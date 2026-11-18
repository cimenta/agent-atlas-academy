// The rules of the guided Create steps: what the student has decided, which steps are open, what the buttons may do.
// Pure: no page, no storage. The page asks and shows the answer.
import { TASK_MAX_CHARS } from "../engine/catalog.js";

export const STEPS = ["setup", "diagram", "check"];

// Nothing has a default except the limits: they are read from Settings, so they start decided and the student may change them.
export function emptyDecisions() {
  return { pattern: false, providers: false, model: false, memory: false, limits: { maxSteps: true, maxTokens: true, maxSearches: true } };
}

// The task is decided when it has text (spaces alone do not count) and is not too long.
export function taskDecided(task) {
  const text = typeof task === "string" ? task.trim() : "";
  return text !== "" && text.length <= TASK_MAX_CHARS;
}

const count = (flags) => flags.filter(Boolean).length;
const stateOf = (done, total) => (done === total ? "done" : done === 0 ? "none" : "part");

// nodeCount, editorOk: how many agents the diagram has and whether the editor reports no problems.
// keysReady: every key slot the agents use has its key.
export function stepStatus({ task, decisions, nodeCount, editorOk, keysReady }) {
  const parts = {
    task: taskDecided(task),
    pattern: decisions.pattern === true,
    providers: decisions.providers === true,
    model: decisions.model === true,
    memory: decisions.memory === true,
  };
  parts.providerModel = parts.providers && parts.model;
  const setup = stateOf(count([parts.task, parts.pattern, parts.providerModel, parts.memory]), 4);
  const diagram = nodeCount > 0 ? (editorOk ? "done" : "part") : "none";
  const limits = stateOf(count(Object.values(decisions.limits)), 3);
  const key = keysReady ? "done" : "none";
  const check = limits === "done" && key === "done" ? "done" : limits === "none" && key === "none" ? "none" : "part";
  const open = setup === "done";
  return { parts, setup, diagram, limits, key, check, locked: { diagram: !open, check: !open }, ready: setup === "done" && diagram === "done" && check === "done" };
}

// Which buttons work. Back needs an earlier step, Next an open later one, Run needs everything decided.
export function navState({ step, status }) {
  const i = STEPS.indexOf(step);
  return { back: i > 0, next: i >= 0 && i < STEPS.length - 1 && !status.locked[STEPS[i + 1]], run: status.ready };
}

// A change (for example a provider switched off) can undecide step 1: then the student goes back to it.
export function stepAfterChange(step, status) {
  return status.locked[step] === true ? "setup" : step;
}

// What still stops Run once step 1 is done, in the order the student meets it.
export function missing(status) {
  return [status.diagram !== "done" && "diagram", status.limits !== "done" && "limits", status.key !== "done" && "key"].filter(Boolean);
}

export function footHint(status) {
  if (status.setup !== "done") return "setup";
  return missing(status).length > 0 ? "missing" : "ready";
}

// The key slots after one provider is switched on or off. The order is the order of `order`, and none may be left on.
export function toggleSlot(slots, id, order) {
  return order.filter((s) => (s === id ? !slots.includes(s) : slots.includes(s)));
}

// A default model stays valid while its provider is on and still offers it. modelsOf(slot) lists the models the slot offers.
export function modelValid(model, slots, modelsOf) {
  return model !== null && model !== undefined && slots.includes(model.slot) && modelsOf(model.slot).some((m) => m.key === model.model);
}

// Sets the default model of a design that came from a definition without giving its agents the default:
// an agent whose own provider and model are still allowed (ok(agent)) keeps them.
export function setDefaultKeepingAgents(editor, choice, ok) {
  const before = editor.design().nodes.map((n) => ({ id: n.id, slot: n.slot, model: n.model }));
  editor.setDefaultModel(choice);
  for (const b of before) {
    const own = { slot: b.slot ?? choice.slot, model: b.model };
    if (!ok(own)) continue;
    if (own.slot !== choice.slot || own.model !== choice.model) editor.setNodeModel(b.id, own);
  }
}

// In the workspace layout the right column (diagram and checks) is locked until step 1 is decided.
export function workspaceLocked(status) {
  return status.locked.diagram === true;
}

// The estimate in the workspace bar, in USD: tokens and the search fee together.
export function workspaceEstimateUsd(est) {
  return (est.totalUsd ?? est.costUsd).toFixed(3);
}

// Run needs everything decided, a diagram without problems, and no failed run waiting to be carried on.
export function runAllowed({ status, verdict, retryPending }) {
  return status.ready && verdict?.ok === true && !retryPending;
}
