// The task and diagram being made on the Create tab. Kept while the app is open, so a language
// switch or a visit to another tab does not lose them. A run opened in the player can also fill it.
import { createEditor } from "./editor-model.js";
import { loadDefinition } from "./definition.js";

// slots: the key slots chosen on the Create tab (one or more); null until the tab is first opened.
export const draft = { task: "", pattern: "sequential", editor: createEditor("sequential"), limits: null, slots: null };

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
  win.location.hash = "#/play/create";
  return true;
}
