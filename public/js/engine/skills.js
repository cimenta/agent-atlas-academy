// The skills of an agent: pieces of text added to its prompt. A skill is a role (who the agent is), a procedure ("postup": how it works)
// or a style ("styl": how it writes). An agent has at most one role, at most one procedure and any number of styles, up to SKILLS_MAX in all.
// What an agent carries is a snapshot: { id?, kind, name, param?, text }, where text is the whole composed text of the skill (its parents and
// its culture included), so that a run, a replay and a shared definition do not depend on the library of the person who made them.
// Pure: no DOM and no storage. Shared by the browser and the server function.

export const SKILL_KINDS = ["role", "postup", "styl"];
export const SKILLS_MAX = 6;
export const SKILL_NAME_MAX = 60;
export const SKILL_TEXT_MAX = 4000;

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const KIND_WORD = { role: "role", postup: "procedure", styl: "style" };
const ORDER = { role: 0, postup: 1, styl: 2 };
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const PARAM = /^[a-z]{2,8}$/;

function entryOk(entry) {
  return (
    isObject(entry) &&
    SKILL_KINDS.includes(entry.kind) &&
    typeof entry.name === "string" &&
    entry.name.trim() !== "" &&
    entry.name.length <= SKILL_NAME_MAX &&
    typeof entry.text === "string" &&
    entry.text.trim() !== "" &&
    entry.text.length <= SKILL_TEXT_MAX &&
    (entry.id === undefined || (typeof entry.id === "string" && ID.test(entry.id))) &&
    (entry.param === undefined || (typeof entry.param === "string" && PARAM.test(entry.param)))
  );
}

// True for a list of 1 to SKILLS_MAX valid skills with at most one role and at most one procedure.
export function validSkills(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > SKILLS_MAX || !list.every(entryOk)) return false;
  return list.filter((e) => e.kind === "role").length <= 1 && list.filter((e) => e.kind === "postup").length <= 1;
}

// The list cleaned: only known fields, trimmed, invalid or surplus entries dropped, ordered role, procedure, styles. Null when nothing is left.
export function cleanSkills(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const entry of list) {
    if (out.length >= SKILLS_MAX || !entryOk(entry)) continue;
    if ((entry.kind === "role" || entry.kind === "postup") && out.some((e) => e.kind === entry.kind)) continue;
    out.push({ ...(entry.id !== undefined ? { id: entry.id } : {}), kind: entry.kind, name: entry.name.trim(), ...(entry.param !== undefined ? { param: entry.param } : {}), text: entry.text.trim() });
  }
  if (out.length === 0) return null;
  return out.map((e, i) => [e, i]).sort((a, b) => ORDER[a[0].kind] - ORDER[b[0].kind] || a[1] - b[1]).map(([e]) => e);
}

// What the agent's system prompt gets from its skills ("" when it has none).
export function skillsPromptText(list) {
  const skills = cleanSkills(list);
  if (!skills || !validSkills(skills)) return "";
  return `Skills: extra instructions that add to your role above and do not replace it.\n${skills.map((e) => `[${KIND_WORD[e.kind]}: ${e.name}]\n${e.text}`).join("\n")}`;
}
