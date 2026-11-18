// The notebook panel of the replay: the notes written so far, each with its author. Null when there are none.
import { h } from "../dom.js";

// `notes` is what notebookOf gives; `label` turns an agent id into the name shown in the diagram; `help` makes the ? (optional).
export function notebookPanel({ doc, t, notes, label, help = null }) {
  if (notes.length === 0) return null;
  return h(
    doc,
    "div",
    { class: "nb", "data-ui": "notebook-panel" },
    h(doc, "h4", { "data-ui": "notebook-heading" }, t("notebook.heading", { n: notes.length }), ...(help ? [help] : [])),
    ...notes.map((note) => h(doc, "div", { class: "n", "data-ui": "notebook-note" }, h(doc, "b", {}, t("notebook.author", { name: label(note.agent), n: note.n })), note.text)),
  );
}
