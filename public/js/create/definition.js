// A run definition: the task and the design of a run, without its events, answers or costs.
// It can be exported from a run, shared as a JSON file and loaded into the Create tab, which
// then looks exactly as if the user had built it. Pure: no DOM.
import { MODELS, DEFAULT_MODEL, TASK_MAX_CHARS } from "../engine/catalog.js";
import { PATTERNS } from "../engine/patterns.js";
import { isSlot } from "../key-slots.js";
import { createEditor } from "./editor-model.js";
import { ABOUT_FIELDS, ABOUT_LIMITS } from "../run-schema.js";

export const DEFINITION_FORMAT = "agent-atlas-run-definition";
export const DEFINITION_VERSION = 1;
export const DEFINITION_MAX_CHARS = 200000;

const MODEL_KEYS = new Set(MODELS.map((m) => m.key));
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The About text of a definition: { title, author, url, description } in one language, or { en: {...}, cs: {...} } with one for each.
// Only known fields, trimmed and cut to their limits; null when nothing is left.
const cleanFields = (values) => {
  const out = {};
  for (const key of ABOUT_FIELDS) {
    const value = typeof values?.[key] === "string" ? values[key].trim().slice(0, ABOUT_LIMITS[key]) : "";
    if (value !== "" && (key !== "url" || /^https?:\/\/\S+$/i.test(value))) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
};

export function cleanDefinitionAbout(about) {
  if (!isObject(about)) return null;
  if (ABOUT_FIELDS.some((key) => key in about)) return cleanFields(about);
  const out = {};
  for (const [lang, values] of Object.entries(about)) {
    const fields = isObject(values) ? cleanFields(values) : null;
    if (fields) out[lang] = fields;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// The About of a definition for one language: the text of that language, else English, else the first one given.
export function aboutForLanguage(about, language) {
  if (!isObject(about)) return null;
  if (ABOUT_FIELDS.some((key) => key in about)) return { ...about };
  const chosen = about[language] ?? about.en ?? Object.values(about)[0];
  return isObject(chosen) ? { ...chosen } : null;
}

export function buildDefinition({ task, design, about }) {
  const cleaned = cleanDefinitionAbout(about);
  return {
    format: DEFINITION_FORMAT,
    version: DEFINITION_VERSION,
    task: typeof task === "string" ? task : "",
    ...(cleaned ? { about: cleaned } : {}),
    design: structuredClone(design),
  };
}

// The definition of a recorded run: its task and design. Null when the run did not record
// its design (the hand-made sample run, for instance).
export function definitionFromRun(run) {
  const start = Array.isArray(run?.events) ? run.events.find((e) => e.type === "run_start") : undefined;
  const design = run?.design ?? start?.design;
  if (!isObject(design)) return null;
  return buildDefinition({ task: run?.task ?? start?.task ?? "", design, about: run?.about });
}

const fail = (code, errors) => ({ ok: false, code, ...(errors ? { errors } : {}) });

// Reads the text of a definition file. On success the result has everything the Create tab
// needs: the task, the pattern, a filled editor, and notes about what had to be changed.
export function loadDefinition(text) {
  if (typeof text !== "string" || text.length > DEFINITION_MAX_CHARS) return fail("tooBig");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("notJson");
  }
  if (!isObject(data) || data.format !== DEFINITION_FORMAT) return fail("notDefinition");
  if (!Number.isInteger(data.version) || data.version < 1) return fail("notDefinition");
  if (data.version > DEFINITION_VERSION) return fail("newer");
  const { design } = data;
  if (!isObject(design) || !PATTERNS.includes(design.pattern) || !Array.isArray(design.nodes) || !Array.isArray(design.edges)) return fail("invalid");

  const notes = [];
  let task = typeof data.task === "string" ? data.task : "";
  if (task.length > TASK_MAX_CHARS) {
    task = task.slice(0, TASK_MAX_CHARS);
    notes.push("taskCut");
  }

  const editor = createEditor(design.pattern);
  if (design.memory?.notebook === true) editor.setNotebook(true);
  const ids = new Map();
  for (const node of design.nodes) {
    if (!isObject(node)) return fail("invalid");
    const overrides = {};
    if (typeof node.model === "string") {
      if (MODEL_KEYS.has(node.model)) overrides.model = node.model;
      else {
        overrides.model = DEFAULT_MODEL;
        if (!notes.includes("model")) notes.push("model");
      }
    }
    if (isSlot(node.slot)) {
      overrides.slot = node.slot;
      if (node.custom === true) overrides.custom = true;
    }
    if (typeof node.search === "boolean") overrides.search = node.search;
    if (node.addToPrevious === true) overrides.addToPrevious = true;
    if (isObject(node.limits)) overrides.limits = node.limits;
    if (node.onLimit === "pass") overrides.onLimit = "pass";
    if (node.approve === true) overrides.approve = true;
    if (node.condense === true) overrides.condense = true;
    if (isObject(node.creates)) overrides.creates = node.creates;
    if (isObject(node.format)) overrides.format = node.format;
    if (Array.isArray(node.guardrails)) overrides.guardrails = node.guardrails;
    if (design.memory?.notebook === true && typeof node.notebook === "string") overrides.notebook = node.notebook;
    for (const key of ["name", "instructions", "stance"]) if (typeof node[key] === "string") overrides[key] = node[key];
    const added = editor.addNode(node.agent, overrides);
    if (!added.ok) return fail("invalid", [{ code: added.code }]);
    ids.set(node.id, added.id);
  }
  for (const edge of design.edges) {
    if (!isObject(edge) || !ids.has(edge.from) || !ids.has(edge.to)) return fail("invalid");
    const joined = editor.connect(ids.get(edge.from), ids.get(edge.to));
    if (!joined.ok) return fail("invalid", [{ code: joined.code }]);
  }
  if ((design.pattern === "debate" || design.pattern === "evaluator") && Number.isInteger(design.rounds)) editor.setRounds(design.rounds);
  if (design.pattern === "handoff" && ids.has(design.start)) editor.setStart(ids.get(design.start));
  if (design.pattern === "evaluator" && typeof design.criteria === "string") editor.setCriteria(design.criteria);
  if (design.pattern === "evaluator" && design.selfCritique === true) editor.setSelfCritique(true);

  const problems = editor.errors();
  if (problems.length > 0) return fail("invalid", problems);
  return { ok: true, task, pattern: design.pattern, editor, notes, about: cleanDefinitionAbout(data.about) };
}
