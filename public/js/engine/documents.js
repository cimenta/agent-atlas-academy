// The documents of the student: text the student adds to a run (a text file, a saved web page or pasted text) and the search in it.
// Pure: no DOM, no network. The text travels in the design of the run (design.documents), so a recording replays without the files.
// A document is never put into a prompt by itself: only the tool document_search brings passages of it to the model.
import { ToolError } from "./own-tools.js";

export const DOC_LIMITS = { files: 3, totalChars: 200000, nameMax: 80, passageChars: 600, passages: 3 };
export const DOC_EXTENSIONS = ["txt", "md", "csv", "json", "html", "htm"];

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The name of a document: no control characters, cut to the limit.
export const cleanDocName = (name) => String(name ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, DOC_LIMITS.nameMax);

export const docChars = (docs) => (Array.isArray(docs) ? docs.reduce((n, d) => n + (typeof d?.text === "string" ? d.text.length : 0), 0) : 0);

// Is this list a good design.documents? Used by the design check.
export function validDocuments(docs) {
  if (!Array.isArray(docs) || docs.length === 0 || docs.length > DOC_LIMITS.files) return false;
  if (!docs.every((d) => isObject(d) && typeof d.name === "string" && d.name.trim() !== "" && d.name.length <= DOC_LIMITS.nameMax && typeof d.text === "string" && d.text.trim() !== "")) return false;
  return docChars(docs) <= DOC_LIMITS.totalChars;
}

// The documents of a design, cleaned (what a definition file or the editor hands over): only known fields, only what fits.
export function cleanDocuments(docs) {
  if (!Array.isArray(docs)) return [];
  const out = [];
  let total = 0;
  for (const d of docs) {
    if (out.length >= DOC_LIMITS.files || !isObject(d) || typeof d.text !== "string") continue;
    const name = cleanDocName(d.name);
    const text = d.text;
    if (name === "" || text.trim() === "" || total + text.length > DOC_LIMITS.totalChars) continue;
    out.push({ name, text });
    total += text.length;
  }
  return out;
}

const ENTITIES = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

// The readable text of a web page that was saved as a file. The page is only cut up as text: nothing is drawn and no script runs.
export function htmlToText(html) {
  let s = String(html ?? "");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  s = s.replace(/<(script|style|nav|footer|noscript|svg|head|template|iframe)\b[\s\S]*?<\/\1\s*>/gi, " ");
  s = s.replace(/<\/?(p|div|br|li|ul|ol|h[1-6]|tr|table|section|article|header|main|aside|blockquote|pre|figure|form)\b[^>]*>/gi, "\n");
  s = s.replace(/<[^>]*>/g, "");
  s = s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isInteger(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : " ";
    }
    return ENTITIES[code.toLowerCase()] ?? " ";
  });
  return s.split("\n").map((line) => line.replace(/[ \t ]+/g, " ").trim()).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// The text of a file the student picked: its extension decides how it is read. { ok, text } or { ok: false, code }.
export function textFromFile(name, raw) {
  const extension = String(name ?? "").toLowerCase().split(".").pop();
  if (!DOC_EXTENSIONS.includes(extension)) return { ok: false, code: "type" };
  let text = String(raw ?? "").replace(/^﻿/, "");
  if (extension === "html" || extension === "htm") text = htmlToText(text);
  text = text.replace(/\r\n?/g, "\n").trim();
  if (text === "") return { ok: false, code: "empty" };
  return { ok: true, text };
}

// Can this text be added to the documents that are already there? { ok } or { ok: false, code: "files" | "size" }.
export function canAdd(docs, text) {
  const list = Array.isArray(docs) ? docs : [];
  if (list.length >= DOC_LIMITS.files) return { ok: false, code: "files" };
  if (docChars(list) + text.length > DOC_LIMITS.totalChars) return { ok: false, code: "size" };
  return { ok: true };
}

const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

// The passages of one text: about passageChars long, cut at a line break or a space when there is one.
export function passagesOf(text, size = DOC_LIMITS.passageChars) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + size, text.length);
    if (end < text.length) {
      const cut = Math.max(text.lastIndexOf("\n", end), text.lastIndexOf(" ", end));
      if (cut > start + size / 2) end = cut;
    }
    const piece = text.slice(start, end).trim();
    if (piece !== "") out.push({ start, end, text: piece });
    start = end;
  }
  return out;
}

const queryWords = (query) => [...new Set(fold(query).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 2))];

// A word is found when the passage has it; a longer word is also found by its beginning (a simple help for endings, as in Czech).
const found = (word, folded) => folded.includes(word) || (word.length >= 5 && folded.includes(word.slice(0, word.length - 2)));

// The tool document_search: up to 3 passages with the most of the query words, with where they are. No model, no index.
export function searchDocuments({ query } = {}, docs) {
  const q = typeof query === "string" ? query.trim() : "";
  if (q === "") throw new ToolError("A search text (query) is needed.");
  if (q.length > 200) throw new ToolError("The search text is too long (at most 200 characters).");
  if (!Array.isArray(docs) || docs.length === 0) throw new ToolError("No documents were added to this run, so there is nothing to search.");
  const words = queryWords(q);
  if (words.length === 0) throw new ToolError("The search text has no words to look for.");
  const scored = [];
  for (const d of docs) {
    for (const p of passagesOf(d.text)) {
      const folded = fold(p.text);
      const hits = words.filter((w) => found(w, folded));
      if (hits.length > 0) scored.push({ name: d.name, ...p, hits, order: scored.length });
    }
  }
  if (scored.length === 0) return `No passage matches "${q}". Try other words, or the words the document itself would use.`;
  scored.sort((a, b) => b.hits.length - a.hits.length || a.order - b.order);
  return scored
    .slice(0, DOC_LIMITS.passages)
    .map((p, i) => `Passage ${i + 1} (${p.name}, characters ${p.start + 1}-${p.end}, matches: ${p.hits.join(", ")}):\n${p.text}`)
    .join("\n\n");
}
