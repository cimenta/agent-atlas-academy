// The skills a student made and the skills each agent type starts with, kept in this browser (localStorage, "aa.skills").
// Never throws: a blocked or broken storage gives an empty library, and a change that can not be saved just does not persist.
import { AGENT_TYPES } from "../engine/catalog.js";
import { createLibrary, cleanDefaults, cleanUserSkill } from "../skill-library.js";

const KEY = "aa.skills";
export const SKILLS_VERSION = 1;
export const USER_SKILLS_MAX = 200;
const newId = () => `u-${Math.random().toString(36).slice(2, 8)}`;

export function createSkillsStore(storage) {
  let changes = 0;
  function read() {
    try {
      const raw = storage.getItem(KEY);
      const data = raw ? JSON.parse(raw) : {};
      return { skills: Array.isArray(data?.skills) ? data.skills : [], defaults: data?.defaults ?? {} };
    } catch {
      return { skills: [], defaults: {} };
    }
  }
  function write(skills, defaults) {
    try {
      storage.setItem(KEY, JSON.stringify({ version: SKILLS_VERSION, skills, defaults }));
    } catch {
      // the change just does not persist
    }
    changes += 1;
  }
  function state() {
    const data = read();
    const lib = createLibrary(data.skills);
    return { lib, defaults: cleanDefaults(data.defaults, Object.keys(AGENT_TYPES)) };
  }
  return {
    // The library as it is now (a new one each time, so it never goes stale).
    library: () => state().lib,
    defaults: () => state().defaults,
    // The library as it would be with this skill (a draft that is not saved yet) in place of the stored one; for a live preview.
    libraryWith(skill) {
      const { lib } = state();
      const clean = cleanUserSkill(skill);
      if (!clean) return lib;
      const users = lib.users().some((u) => u.id === clean.id) ? lib.users().map((u) => (u.id === clean.id ? clean : u)) : [...lib.users(), clean];
      return createLibrary(users);
    },
    // How many times the library or the defaults were changed in this tab; a backup may use it.
    changes: () => changes,
    // Adds a skill of a student; a missing id gets a new one. Returns the saved skill, or null when it can not be one or the library is full.
    add(skill) {
      const { lib, defaults } = state();
      if (lib.users().length >= USER_SKILLS_MAX) return null;
      const clean = cleanUserSkill({ ...skill, id: skill?.id ?? newId() });
      if (!clean || lib.get(clean.id)) return null;
      write(createLibrary([...lib.users(), clean]).users(), defaults);
      return clean;
    },
    // Replaces a skill of a student by id. A parent that would make a cycle or a chain that is too long is dropped by the library.
    update(skill) {
      const { lib, defaults } = state();
      const clean = cleanUserSkill(skill);
      if (!clean || !lib.users().some((u) => u.id === clean.id)) return null;
      const next = createLibrary(lib.users().map((u) => (u.id === clean.id ? clean : u)));
      write(next.users(), defaults);
      return next.get(clean.id) ?? null;
    },
    // Deletes a skill of a student that has no children; returns false when it has children or does not exist.
    remove(id) {
      const { lib, defaults } = state();
      if (!lib.users().some((u) => u.id === id) || lib.children(id).length > 0) return false;
      const next = createLibrary(lib.users().filter((u) => u.id !== id));
      write(next.users(), cleanDefaults(Object.fromEntries(Object.entries(defaults).map(([type, d]) => [type, { ...d, role: d.role === id ? "" : d.role, postup: d.postup === id ? "" : d.postup, styles: d.styles.filter((s) => s !== id) }])), Object.keys(AGENT_TYPES)));
      return true;
    },
    // For an export: the skills of the student and the defaults of the agent types, and the way back.
    // A merge adds the skills whose id is not here yet and the defaults of the agent types that have none; a replace takes both as they are.
    exportData() {
      const { lib, defaults } = state();
      return { skills: lib.users(), defaults };
    },
    importData(data, mode) {
      const incoming = createLibrary(Array.isArray(data?.skills) ? data.skills : []).users();
      const incomingDefaults = cleanDefaults(data?.defaults, Object.keys(AGENT_TYPES));
      const { lib, defaults } = state();
      let users;
      let nextDefaults;
      if (mode === "replace") {
        users = incoming;
        nextDefaults = incomingDefaults;
      } else {
        const have = new Set(lib.users().map((u) => u.id));
        users = [...lib.users(), ...incoming.filter((u) => !have.has(u.id))].slice(0, USER_SKILLS_MAX);
        nextDefaults = { ...incomingDefaults, ...defaults };
      }
      const next = createLibrary(users);
      write(next.users(), cleanDefaults(nextDefaults, Object.keys(AGENT_TYPES)));
      return next.users().length;
    },
    clearAll() {
      write([], {});
    },
    setDefaults(agentType, value) {
      if (!(agentType in AGENT_TYPES)) return;
      const { lib, defaults } = state();
      const next = cleanDefaults({ ...defaults, [agentType]: value }, Object.keys(AGENT_TYPES));
      if (!next[agentType]) delete next[agentType];
      write(lib.users(), next);
    },
  };
}
