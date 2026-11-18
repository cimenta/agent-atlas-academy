// The shared notebook as the replay shows it: the notes revealed so far, and what each agent wrote and read.
// Everything comes from the recorded events (the note events and the input of each model call).
import { NOTEBOOK_MARK } from "../engine/notebook.js";

// The number of notes in the Notebook block at the end of a message (0 when there is none).
function notesRead(content) {
  if (typeof content !== "string") return 0;
  const at = content.lastIndexOf(NOTEBOOK_MARK);
  if (at === -1) return 0;
  return (content.slice(at + NOTEBOOK_MARK.length).match(/^- /gm) ?? []).length;
}

// { on, notes: [{ n, agent, text }], perAgent: Map(agent -> { wrote, read }) }.
// `on` is true when the run had the notebook switched on. `read` is how many notes the agent saw at its latest call.
export function notebookOf(events, cursor = events.length) {
  const list = Array.isArray(events) ? events : [];
  const on = list.find((e) => e?.type === "run_start")?.design?.memory?.notebook === true;
  const notes = [];
  const perAgent = new Map();
  const mark = (id) => {
    if (!perAgent.has(id)) perAgent.set(id, { wrote: 0, read: 0 });
    return perAgent.get(id);
  };
  if (!on) return { on, notes, perAgent };
  for (const event of list.slice(0, Math.max(0, cursor))) {
    if (event?.type === "note" && typeof event.agent === "string") {
      notes.push({ n: Number(event.n) || notes.length + 1, agent: event.agent, text: String(event.text ?? "") });
      mark(event.agent).wrote += 1;
    } else if (event?.type === "round" && typeof event.agent === "string") {
      const seen = (Array.isArray(event.newMessages) ? event.newMessages : []).filter((m) => m?.role === "user").map((m) => notesRead(m.content));
      if (seen.some((n) => n > 0)) mark(event.agent).read = Math.max(...seen);
      else if ((Array.isArray(event.newMessages) ? event.newMessages : []).some((m) => m?.role === "user" && typeof m.content === "string")) mark(event.agent);
    }
  }
  return { on, notes, perAgent };
}
