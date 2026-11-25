// The shared notebook of a run: short notes that agents leave for each other while the run lasts.
// It lives only in the run. The program reads and writes it; no model decides what is kept.
import { validFormat } from "./format.js";
import { ToolError } from "./own-tools.js";
export const NOTE_MAX = 600;
export const NOTEBOOK_READ_MAX = 6000;
export const NOTEBOOK_MARK = "\n\nNotebook:\n";
export const NOTEBOOK_CHOICES = ["none", "read", "write", "both"];
const DECISION_AGENTS = new Set(["supervisor", "evaluator", "router", "tally"]);

// May an agent of this type, in this pattern, write notes? An agent whose reply is read by the program as a decision (the
// JSON of a supervisor, an evaluator, a router, a tally, or any agent in a handoff) may not: a note could break the decision.
export function mayWrite(agent, pattern) {
  return !DECISION_AGENTS.has(agent) && pattern !== "handoff";
}

// What one agent may do with the notebook: { on, read, write }. An agent with an answer format reads only: its reply is one JSON
// object, so notes after it would break the check.
export function notebookRole(node, design) {
  if (design?.memory?.notebook !== true) return { on: false, read: false, write: false };
  const choice = NOTEBOOK_CHOICES.includes(node?.notebook) ? node.notebook : "both";
  return { on: true, read: choice === "read" || choice === "both", write: mayWrite(node?.agent, design?.pattern) && !validFormat(node?.format) && (choice === "write" || choice === "both") };
}

// A note is one line: line breaks inside it become spaces, so it cannot pass for a separate entry of another agent.
const oneLine = (text) => String(text).replace(/\s+/g, " ").replace(/<\/?note\s*>/gi, "").trim();

// Takes the notes out of a reply. A note is the text between <note> and </note>. An empty note is not a note. A tag that is
// never closed (a reply cut short) is dropped with what follows it. Returns the reply without the notes and the notes, each
// cut at NOTE_MAX characters.
export function extractNotes(text) {
  if (typeof text !== "string" || !/<note\s*>/i.test(text)) return { text: typeof text === "string" ? text : "", notes: [] };
  const notes = [];
  let rest = text.replace(/<note\s*>([\s\S]*?)<\/note\s*>/gi, (_, body) => {
    const note = oneLine(body).slice(0, NOTE_MAX).trim();
    if (note !== "") notes.push(note);
    return "";
  });
  const open = rest.search(/<note\s*>/i);
  if (open !== -1) rest = rest.slice(0, open);
  rest = rest.replace(/<\/?note\s*>/gi, "");
  return { text: rest.replace(/\n{3,}/g, "\n\n").trim(), notes };
}

// The tool notes: the model writes a note into the notebook of the run, or reads the notes so far. `book` is { write(text), read() }
// of the notebook, or null when the run has no notebook (the tool then says so). It is the same notebook the tags <note> write to.
export function notesToolText({ action, text } = {}, book) {
  if (!book) throw new ToolError("The notebook is switched off in this run, so there are no notes. It is switched on in step 1 of Create, under Memory.");
  if (action === "read") {
    const notes = book.read();
    return notes === "" ? "The notebook is empty." : notes;
  }
  if (action === "write") {
    const body = oneLine(typeof text === "string" ? text : "");
    if (body === "") throw new ToolError("A note needs some text.");
    const note = book.write(body);
    if (note.duplicate) return `Note ${note.n} already says this, so nothing was added.`;
    return `Note ${note.n} saved${body.length > NOTE_MAX ? ` (cut to ${NOTE_MAX} characters)` : ""}.`;
  }
  throw new ToolError('The action must be "write" or "read".');
}

export function createNotebook({ emit = () => {} } = {}) {
  const list = [];
  let warned = false;
  return {
    // Adds a note. `silent` is for a reply that an earlier try of the run already recorded: the event exists.
    add(agent, text, { silent = false } = {}) {
      const note = { n: list.length + 1, agent, text: oneLine(text).slice(0, NOTE_MAX) };
      if (note.text === "") return null;
      // The same note twice (an agent that read the notebook and copied a note back) adds nothing: the first one stays, and nothing is emitted.
      const same = list.find((n) => n.text.toLowerCase() === note.text.toLowerCase());
      if (same) return { ...same, duplicate: true };
      list.push(note);
      if (!silent) emit({ type: "note", agent, text: note.text, n: note.n });
      return note;
    },
    notes: () => list.map((n) => ({ ...n })),
    // The block added to the end of the input of an agent that reads: the newest notes that fit in NOTEBOOK_READ_MAX.
    // mode: live (warns once), replay (an earlier try already recorded the warning), peek (changes nothing).
    forReader({ mode = "live" } = {}) {
      if (list.length === 0) return "";
      const lines = list.map((n) => `- ${n.agent}: ${n.text}`);
      let size = 0;
      let first = lines.length;
      while (first > 0 && size + lines[first - 1].length + 1 <= NOTEBOOK_READ_MAX) {
        first -= 1;
        size += lines[first].length + 1;
      }
      if (first === lines.length) first = lines.length - 1; // the newest note is always shown, even when it alone is long
      const dropped = first;
      if (dropped > 0 && !warned && mode !== "peek") {
        warned = true;
        if (mode === "live") emit({ type: "warning", notebook: { dropped }, message: `The notebook is longer than agents read (${NOTEBOOK_READ_MAX} characters), so the ${dropped} oldest ${dropped === 1 ? "note was" : "notes were"} left out of what they read. The replay keeps every note.` });
      }
      return `${NOTEBOOK_MARK}${lines.slice(first).join("\n")}`;
    },
  };
}
