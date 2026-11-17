// The task and diagram being made on the Create tab. Kept while the app is open, so a language
// switch or a visit to another tab does not lose them. A run opened in the player can also fill it.
import { createEditor } from "./editor-model.js";
import { loadDefinition } from "./definition.js";

// slots: the key slots chosen on the Create tab (one or more); null until the tab is first opened.
export const draft = { task: "", pattern: "sequential", editor: createEditor("sequential"), limits: null, limitsEdited: false, slots: null, retry: null, approve: false, retryUseCurrent: true };
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
  draft.pattern = loaded.pattern;
  draft.editor = loaded.editor;
  return true;
}

// Asks before replacing work in progress, fills the draft and opens the Create tab.
export function openInCreate(doc, t, definition) {
  const win = doc.defaultView;
  if (draftHasWork() && !win.confirm(t("create.loadConfirm"))) return false;
  if (!useDefinition(definition)) return false;
  // A new run starts from the limits of Settings; limits changed by hand for an earlier run are dropped.
  draft.limits = null;
  draft.limitsEdited = false;
  win.location.hash = "#/play/create";
  return true;
}
