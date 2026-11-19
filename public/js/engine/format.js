// The answer format of an agent: 1 to 5 named, typed fields. Pure rules, no model calls: which agents may have one, what a
// valid one is, the text that asks for it, the check of an answer, the message that asks for a repair, and the JSON schema.
import { candidates } from "./runners/supervisor.js";

export const FORMAT_MAX_FIELDS = 5;
export const FIELD_NAME_MAX = 30;
export const FORMAT_TYPES = ["text", "number", "yesno", "list"];

const NOT_DECISION_FREE = ["supervisor", "evaluator", "router", "tally", "splitter"];

// An agent whose reply the program already reads as a decision has no format of its own.
export function mayFormat(agent, pattern) {
  if (pattern === "handoff") return false;
  if (NOT_DECISION_FREE.includes(agent)) return false;
  if (agent === "planner" && pattern === "planexec") return false;
  return true;
}

const NAME = /^[\p{L}\p{N} _]+$/u;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function fieldOk(field) {
  return isObject(field) && typeof field.name === "string" && field.name.trim() === field.name && field.name.length >= 1 && field.name.length <= FIELD_NAME_MAX && NAME.test(field.name) && FORMAT_TYPES.includes(field.type);
}

export function validFormat(format) {
  if (!isObject(format) || !Array.isArray(format.fields)) return false;
  const fields = format.fields;
  if (fields.length < 1 || fields.length > FORMAT_MAX_FIELDS || !fields.every(fieldOk)) return false;
  return new Set(fields.map((f) => f.name.toLowerCase())).size === fields.length;
}

// What the editor keeps: names trimmed, fields that are not valid or repeat a name dropped, at most five. Null when none remain.
export function cleanFormat(format) {
  if (!isObject(format) || !Array.isArray(format.fields)) return null;
  const seen = new Set();
  const fields = [];
  for (const raw of format.fields) {
    if (!isObject(raw) || typeof raw.name !== "string") continue;
    const field = { name: raw.name.trim(), type: raw.type };
    if (!fieldOk(field) || seen.has(field.name.toLowerCase())) continue;
    seen.add(field.name.toLowerCase());
    fields.push(field);
    if (fields.length === FORMAT_MAX_FIELDS) break;
  }
  return fields.length > 0 ? { fields } : null;
}

const WORDS = { text: "text", number: "a number", yesno: "true or false", list: "a list of texts" };

export function formatPromptText(format) {
  return `Reply with one JSON object and nothing else (no text before or after it). The fields:\n${format.fields.map((f) => `"${f.name}": ${WORDS[f.type]}`).join("\n")}`;
}

const typeOk = {
  text: (v) => typeof v === "string",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  yesno: (v) => typeof v === "boolean",
  list: (v) => Array.isArray(v) && v.every((item) => typeof item === "string"),
};

// Reads an answer leniently (plain, fenced, or between the first and last brace) and checks every field.
export function checkFormat(text, format) {
  let data = null;
  if (typeof text === "string") {
    for (const candidate of candidates(text)) {
      try {
        const parsed = JSON.parse(candidate.trim());
        if (isObject(parsed)) {
          data = parsed;
          break;
        }
      } catch {
        // try the next reading
      }
    }
  }
  if (!data) return { ok: false, problems: ["the reply is not one JSON object"] };
  const problems = [];
  const value = {};
  for (const field of format.fields) {
    if (!(field.name in data)) problems.push(`${field.name} is missing`);
    else if (!typeOk[field.type](data[field.name])) problems.push(`${field.name} must be ${WORDS[field.type]}`);
    else value[field.name] = data[field.name];
  }
  if (problems.length > 0) return { ok: false, problems };
  return { ok: true, value, text: JSON.stringify(value) };
}

export function formatRepairText(problems) {
  return `Your reply does not fit the format: ${problems.join("; ")}. Reply again with one JSON object and nothing else.`;
}

const SCHEMA_TYPE = { text: { type: "string" }, number: { type: "number" }, yesno: { type: "boolean" }, list: { type: "array", items: { type: "string" } } };

export function formatSchema(format) {
  return {
    type: "object",
    properties: Object.fromEntries(format.fields.map((f) => [f.name, { ...SCHEMA_TYPE[f.type] }])),
    required: format.fields.map((f) => f.name),
    additionalProperties: false,
  };
}
