// The library of skills: the skills of the app (read-only, with versions) and the skills a student made (kept in this browser),
// how a skill extends another one, and how its text is composed. Pure: no DOM and no storage (see storage/skills-store.js).
// The texts here are prompts for the model, so they are English; the names and help that people read are in the locale files.
import { SKILL_KINDS, SKILL_NAME_MAX, SKILL_TEXT_MAX, SKILLS_MAX, cleanSkills } from "./engine/skills.js";

export const DEPTH_MAX = 3;
export const FOLDER_MAX = 60;
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/i;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

// The cultures of the style Business writing. A line of text added after the text of the style.
export const CULTURE_IDS = ["cs", "en", "th", "in"];
export const DEFAULT_CULTURE = "cs";
const CULTURE_TEXT = {
  cs: "Culture: Czech. Address the reader formally with title and surname, stay factual and polite, avoid superlatives. Close with a formal greeting. Keep the language of the task.",
  en: "Culture: international English. Write directly but politely, in short paragraphs, with a clear next action at the end. Keep the language of the task.",
  th: "Culture: Thai. Write very politely, say bad news indirectly and with an apology, help the other side keep face. Keep the language of the task.",
  in: "Culture: Indian business English. Write formally, respect hierarchy, open with polite phrases, and avoid outdated stock phrases. Keep the language of the task.",
};

// The skills of the app. cur is the current version; versions keeps every version, so a skill of a student stays on the one it was made from.
export const APP_SKILLS = [
  { id: "critic", name: "Critic", kind: "role", cur: 1, versions: { 1: "You are a critic. Examine the work, find weak points, unsupported claims and missing evidence, and for each finding say how to fix it. Do not praise, only assess." } },
  { id: "summarizer", name: "Summarizer", kind: "role", cur: 1, versions: { 1: "You are a summarizer. Reduce the text to at most five sentences. Keep numbers and names, and add nothing that is not in the text." } },
  { id: "planner-steps", name: "Step planner", kind: "postup", cur: 1, versions: { 1: "Procedure: first split the task into numbered steps and write for each step the result that shows it is done. Only then start on the first step." } },
  { id: "business", name: "Business writing", kind: "styl", cur: 1, culture: true, versions: { 1: "Style: business correspondence. A clear subject, a short opening with the reason for writing, a factual core, and a concrete next step with a date. No slang." } },
];
const APP_BY_ID = new Map(APP_SKILLS.map((s) => [s.id, s]));
export const isAppId = (id) => APP_BY_ID.has(id);

// A skill of a student as it is kept: only known fields, trimmed and cut to their limits; null when it can not be a skill.
export function cleanUserSkill(raw) {
  if (!isObject(raw) || typeof raw.id !== "string" || !ID.test(raw.id) || APP_BY_ID.has(raw.id)) return null;
  if (!SKILL_KINDS.includes(raw.kind) || typeof raw.name !== "string" || raw.name.trim() === "") return null;
  const out = {
    id: raw.id,
    name: raw.name.trim().slice(0, SKILL_NAME_MAX),
    kind: raw.kind,
    folder: typeof raw.folder === "string" ? raw.folder.trim().slice(0, FOLDER_MAX) : "",
    parent: typeof raw.parent === "string" && ID.test(raw.parent) ? raw.parent : "",
    text: typeof raw.text === "string" ? raw.text.trim().slice(0, SKILL_TEXT_MAX) : "",
  };
  if (Number.isInteger(raw.parentVersion) && raw.parentVersion >= 1) out.parentVersion = raw.parentVersion;
  if (typeof raw.param === "string" && CULTURE_IDS.includes(raw.param)) out.param = raw.param;
  return out;
}

// The library over a list of student skills. Skills with an unknown parent, a cycle or more than DEPTH_MAX levels lose their parent.
export function createLibrary(rawUsers = []) {
  const seen = new Set();
  let users = [];
  for (const raw of Array.isArray(rawUsers) ? rawUsers : []) {
    const skill = cleanUserSkill(raw);
    if (skill && !seen.has(skill.id)) {
      seen.add(skill.id);
      users.push(skill);
    }
  }
  const byId = () => new Map([...APP_SKILLS, ...users].map((s) => [s.id, s]));
  const chainOf = (skill) => {
    const map = byId();
    const out = [];
    let cur = skill;
    while (cur && out.length <= DEPTH_MAX && !out.includes(cur)) {
      out.unshift(cur);
      cur = cur.parent ? map.get(cur.parent) : undefined;
    }
    return out;
  };
  // Repair: a parent that does not exist, a cycle, or a chain that is too long is cut off.
  const cyclic = (u) => {
    const map = byId();
    const seen = new Set([u.id]);
    let cur = u.parent ? map.get(u.parent) : undefined;
    while (cur) {
      if (seen.has(cur.id)) return true;
      seen.add(cur.id);
      cur = cur.parent ? map.get(cur.parent) : undefined;
    }
    return false;
  };
  users = users.map((u) => {
    if (!u.parent || (byId().has(u.parent) && !cyclic(u) && chainOf(u).length <= DEPTH_MAX)) return u;
    const { parent, parentVersion, ...rest } = u;
    return { ...rest, parent: "" };
  });

  const lib = {
    users: () => users,
    all: () => [...APP_SKILLS, ...users],
    get: (id) => byId().get(id),
    isApp: (skill) => !!skill && APP_BY_ID.has(skill.id),
    chain: chainOf,
    depth: (skill) => chainOf(skill).length,
    children: (id) => users.filter((u) => u.parent === id),
    descendants(id) {
      return lib.children(id).flatMap((c) => [c.id, ...lib.descendants(c.id)]);
    },
    // The skills a skill may extend: not itself or one of its descendants, and not so deep that the chain would pass DEPTH_MAX.
    parentOptions(skill) {
      const bad = new Set([skill.id, ...lib.descendants(skill.id)]);
      const below = (s) => 1 + Math.max(0, ...lib.children(s.id).map(below));
      const height = below(skill);
      return lib.all().filter((p) => !bad.has(p.id) && lib.depth(p) + height <= DEPTH_MAX);
    },
    appRoot: (skill) => chainOf(skill).find((s) => APP_BY_ID.has(s.id)),
    // The skill has a culture when the app skill at the root of its chain has one.
    hasCulture: (skill) => APP_BY_ID.get(lib.appRoot(skill)?.id)?.culture === true,
    cultureOf(skill) {
      const chain = chainOf(skill);
      for (let i = chain.length - 1; i >= 0; i -= 1) if (!APP_BY_ID.has(chain[i].id) && chain[i].param) return chain[i].param;
      return DEFAULT_CULTURE;
    },
    // The parent of a student skill is an app skill that has a newer version than the one the student skill stands on.
    parentChanged(skill) {
      const parent = skill.parent ? APP_BY_ID.get(skill.parent) : undefined;
      return !!parent && Number.isInteger(skill.parentVersion) && skill.parentVersion !== parent.cur;
    },
    // The composed text as parts: the app skill (at the version the student skill stands on), its culture, then each student skill down the chain.
    segments(skill, culture) {
      const chain = chainOf(skill);
      const out = [];
      chain.forEach((node, i) => {
        const app = APP_BY_ID.get(node.id);
        if (app) {
          const next = chain[i + 1];
          const version = next && Number.isInteger(next.parentVersion) && app.versions[next.parentVersion] ? next.parentVersion : app.cur;
          out.push({ type: "app", id: app.id, version, text: app.versions[version] });
          if (app.culture) {
            const value = CULTURE_IDS.includes(culture) ? culture : lib.cultureOf(skill);
            out.push({ type: "culture", value, text: CULTURE_TEXT[value] });
          }
        } else if (node.text !== "") out.push({ type: "user", id: node.id, name: node.name, text: node.text });
      });
      return out;
    },
    text: (skill, culture) => lib.segments(skill, culture).map((s) => s.text).join("\n"),
    // What an agent carries for this skill (see engine/skills.js); null when the composed text is empty.
    entry(skill, culture) {
      const text = lib.text(skill, culture).slice(0, SKILL_TEXT_MAX);
      if (text.trim() === "") return null;
      const param = lib.hasCulture(skill) ? (CULTURE_IDS.includes(culture) ? culture : lib.cultureOf(skill)) : undefined;
      const name = skill.name ?? skill.id;
      return { id: skill.id, kind: skill.kind, name, ...(param ? { param } : {}), text };
    },
  };
  return lib;
}

// The skills an agent carries, read again from the library: an entry whose skill still exists gets its current text (its culture kept),
// an entry whose skill is gone (a shared definition, a deleted skill) keeps its snapshot. The names of app skills stay as they were.
export function refreshEntries(lib, entries) {
  const list = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const skill = typeof entry?.id === "string" ? lib.get(entry.id) : undefined;
    const fresh = skill ? lib.entry(skill, entry.param) : null;
    list.push(fresh ? { ...fresh, name: lib.isApp(skill) ? entry.name : fresh.name } : entry);
  }
  return cleanSkills(list) ?? [];
}

// The defaults of the agent types as they are kept: for each agent type { role, postup, styles, params } of skill ids.
export function cleanDefaults(raw, agentTypes) {
  const out = {};
  if (!isObject(raw)) return out;
  for (const type of agentTypes) {
    const d = raw[type];
    if (!isObject(d)) continue;
    const id = (v) => (typeof v === "string" && ID.test(v) ? v : "");
    const params = {};
    if (isObject(d.params)) for (const [k, v] of Object.entries(d.params)) if (ID.test(k) && CULTURE_IDS.includes(v)) params[k] = v;
    const styles = [...new Set((Array.isArray(d.styles) ? d.styles : []).filter((v) => typeof v === "string" && ID.test(v)))].slice(0, SKILLS_MAX - 2);
    const clean = { role: id(d.role), postup: id(d.postup), styles, params };
    if (clean.role || clean.postup || styles.length > 0) out[type] = clean;
  }
  return out;
}

// A choice of skills as ids: { role, postup, styles, params }. Its entries (see engine/skills.js); a skill that is gone, or of another kind
// than its place, is left out.
export function selectionEntries(lib, d) {
  if (!d) return [];
  const pick = (id, kind) => {
    const skill = id ? lib.get(id) : undefined;
    return skill && skill.kind === kind ? lib.entry(skill, d.params?.[id]) : null;
  };
  const list = [pick(d.role, "role"), pick(d.postup, "postup"), ...(d.styles ?? []).map((id) => pick(id, "styl"))].filter(Boolean);
  return cleanSkills(list) ?? [];
}

// The other way: the choice an agent has made (the entries it carries), and the entries whose skill is not in this library.
export function selectionOf(lib, entries) {
  const selection = { role: "", postup: "", styles: [], params: {} };
  const extra = [];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const skill = typeof entry?.id === "string" ? lib.get(entry.id) : undefined;
    if (!skill || skill.kind !== entry.kind) {
      extra.push(entry);
      continue;
    }
    if (entry.kind === "role") selection.role = entry.id;
    else if (entry.kind === "postup") selection.postup = entry.id;
    else selection.styles.push(entry.id);
    if (entry.param) selection.params[entry.id] = entry.param;
  }
  return { selection, extra };
}

// The skills a new agent of this type starts with, as entries.
export function defaultEntries(lib, defaults, agentType) {
  return selectionEntries(lib, defaults?.[agentType]);
}
