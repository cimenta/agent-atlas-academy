// The task and diagram being made on the Create tab. Kept while the app is open, so a language
// switch or a visit to another tab does not lose them. A run opened in the player can also fill it.
import { createEditor } from "./editor-model.js";
import { loadDefinition } from "./definition.js";
import { emptyDecisions } from "./steps-model.js";

// slots: the key slots chosen on the Create tab (one or more); null while none is chosen (read from the agents of a loaded definition).
// decisions: what the student has decided (nothing has a default). step and subTab: where the student is on the steps.
export const draft = { task: "", about: null, pattern: "sequential", editor: createEditor("sequential"), limits: null, limitsEdited: false, runOverrides: {}, limitsChoice: null, slots: null, retry: null, approve: false, retryUseCurrent: true, decisions: emptyDecisions(), step: "setup", subTab: "agents", describe: false };

export function resetDecisions() {
  draft.decisions = emptyDecisions();
  draft.step = "setup";
  draft.subTab = "agents";
}

// A definition names its pattern, models and memory, so loading one is the student deciding them. The limits are not part of it.
export function decideLoaded() {
  Object.assign(draft.decisions, { pattern: true, providers: true, model: true, memory: true });
}
// runOverrides: answer and handoff sizes an offer of the free-limits warning set for this run only ({ outputTokens, handoffChars });
// limitsChoice: the keep-as-is offer the visitor took (slowly or tomorrow).
// limitsEdited: the visitor changed the limits of this run by hand; otherwise they are read from Settings each time Create opens.
// retryUseCurrent: Retry carries on with the limits of Settings (true) or with the limits the run had (false).
// retry: a failed or paused run (its record) that the Create tab should carry on when it opens.
// approve: the run waits for approval and the visitor approved it, so it carries on past the agents that waited.

export function draftHasWork() {
  return draft.task.trim() !== "" || draft.editor.design().nodes.length > 0;
}

// Fills the draft from a definition (the task and design of a run). False when it cannot be loaded.
export function useDefinition(definition) {
  const loaded = loadDefinition(JSON.stringify(definition));
  if (!loaded.ok) return false;
  draft.task = loaded.task;
  draft.about = loaded.about;
  draft.pattern = loaded.pattern;
  draft.editor = loaded.editor;
  decideLoaded();
  return true;
}

// A loaded definition starts the choices again: the providers are read from its agents, the limits come from Settings
// and the student decides them anew, and the page opens at step 1.
export function resetForLoad() {
  draft.slots = null;
  draft.step = "setup";
  draft.limits = null;
  draft.limitsEdited = false;
  draft.runOverrides = {};
  draft.limitsChoice = null;
  draft.decisions.limits = emptyDecisions().limits;
}

// A run that waits for its key: step 3, the key tab, where the key fields are.
export function showKeyStep() {
  decideLoaded(); // the key tab is only open when step 1 is decided; a run that waits for its key has decided it
  draft.step = "check";
  draft.subTab = "key";
}

// Asks before replacing work in progress, fills the draft and opens the Create tab.
export function openInCreate(doc, t, definition) {
  const win = doc.defaultView;
  if (draftHasWork() && !win.confirm(t("create.loadConfirm"))) return false;
  if (!useDefinition(definition)) return false;
  resetForLoad();
  win.location.hash = "#/play/create";
  return true;
}
