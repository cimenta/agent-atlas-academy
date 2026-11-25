import test from "node:test";
import assert from "node:assert/strict";
import { validSkills, cleanSkills, skillsPromptText, SKILLS_MAX, SKILL_TEXT_MAX } from "../public/js/engine/skills.js";
import { createLibrary, cleanDefaults, cleanUserSkill, refreshEntries, selectionEntries, selectionOf, defaultEntries, APP_SKILLS, DEPTH_MAX } from "../public/js/skill-library.js";
import { createSkillsStore, USER_SKILLS_MAX } from "../public/js/storage/skills-store.js";
import { createEditor, setDefaultSkills } from "../public/js/create/editor-model.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";
import { agentTabIds } from "../public/js/create/agent-tabs.js";

const entry = (kind, name, extra = {}) => ({ kind, name, text: `${name} text`, ...extra });
const user = (id, kind, extra = {}) => ({ id, name: id, kind, text: `${id} text`, ...extra });
const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};
const types = ["researcher", "writer"];

test("a list of skills is valid with one role, one procedure and styles, at most six", () => {
  assert.equal(validSkills([entry("role", "a"), entry("postup", "b"), entry("styl", "c")]), true);
  assert.equal(validSkills([]), false);
  assert.equal(validSkills([entry("role", "a"), entry("role", "b")]), false);
  assert.equal(validSkills([entry("postup", "a"), entry("postup", "b")]), false);
  assert.equal(validSkills(Array.from({ length: SKILLS_MAX + 1 }, (_, i) => entry("styl", `s${i}`))), false);
  assert.equal(validSkills([entry("styl", "a", { text: " " })]), false);
  assert.equal(validSkills([entry("styl", "a", { text: "x".repeat(SKILL_TEXT_MAX + 1) })]), false);
  assert.equal(validSkills([entry("nope", "a")]), false);
  assert.equal(validSkills("x"), false);
});

test("cleaning orders the skills, drops surplus and invalid ones and gives null when nothing is left", () => {
  const out = cleanSkills([entry("styl", "s"), entry("role", "r1"), entry("role", "r2"), entry("postup", "p"), { junk: 1 }]);
  assert.deepEqual(out.map((e) => e.name), ["r1", "p", "s"]);
  assert.equal(cleanSkills([{ junk: 1 }]), null);
  assert.equal(cleanSkills(undefined), null);
});

test("the prompt text names every skill and is empty without skills", () => {
  assert.equal(skillsPromptText(undefined), "");
  const text = skillsPromptText([entry("role", "Critic"), entry("styl", "Polite")]);
  assert.match(text, /\[role: Critic\]/);
  assert.match(text, /\[style: Polite\]/);
});

test("the system prompt of an agent carries its skills after the role", () => {
  const node = { id: "r", agent: "researcher", model: "fast", search: false, skills: [entry("role", "Critic")] };
  const withSkills = systemPromptFor(node, { pattern: "sequential" });
  assert.match(withSkills, /Critic text/);
  assert.doesNotMatch(systemPromptFor({ ...node, skills: undefined }, { pattern: "sequential" }), /Critic text/);
});

test("a design with bad skills on an agent is refused", () => {
  const design = (skills) => ({ pattern: "sequential", nodes: [{ id: "a", agent: "researcher", model: "fast", search: false, skills }, { id: "b", agent: "writer", model: "fast", search: false }], edges: [{ from: "a", to: "b" }] });
  assert.equal(validateDesign(design([entry("styl", "ok")])).errors.some((e) => e.code === "node.skills"), false);
  assert.equal(validateDesign(design([entry("role", "a"), entry("role", "b")])).errors.some((e) => e.code === "node.skills"), true);
});

test("the library holds app skills and student skills, composes text and counts levels", () => {
  const lib = createLibrary([user("mine", "styl", { parent: "business", parentVersion: 1, text: "Mine." })]);
  assert.equal(lib.all().length, APP_SKILLS.length + 1);
  assert.equal(lib.isApp(lib.get("business")), true);
  assert.equal(lib.isApp(lib.get("mine")), false);
  assert.equal(lib.depth(lib.get("mine")), 2);
  assert.match(lib.text(lib.get("mine")), /business correspondence/);
  assert.match(lib.text(lib.get("mine")), /Mine\./);
  assert.equal(lib.hasCulture(lib.get("mine")), true);
  assert.equal(lib.hasCulture(lib.get("critic")), false);
});

test("a culture is added to the text and the default is Czech", () => {
  const lib = createLibrary([]);
  assert.match(lib.text(lib.get("business")), /Czech/);
  assert.match(lib.text(lib.get("business"), "th"), /Thai/);
  assert.equal(lib.entry(lib.get("business"), "in").param, "in");
  assert.equal(lib.entry(lib.get("critic")).param, undefined);
});

test("a parent that is unknown, a cycle and a chain that is too deep are cut off", () => {
  const unknown = createLibrary([user("a", "styl", { parent: "ghost" })]);
  assert.equal(unknown.get("a").parent, "");
  const cycle = createLibrary([user("a", "styl", { parent: "b" }), user("b", "styl", { parent: "a" })]);
  assert.ok(cycle.users().some((u) => u.parent === ""));
  const chain = Array.from({ length: DEPTH_MAX + 2 }, (_, i) => user(`s${i}`, "styl", { parent: i === 0 ? "business" : `s${i - 1}` }));
  const deep = createLibrary(chain);
  assert.ok(deep.users().every((u) => deep.depth(u) <= DEPTH_MAX));
});

test("the options for a parent leave out the skill itself and its descendants", () => {
  const lib = createLibrary([user("a", "styl"), user("b", "styl", { parent: "a" })]);
  const ids = lib.parentOptions(lib.get("a")).map((s) => s.id);
  assert.ok(!ids.includes("a") && !ids.includes("b"));
  assert.ok(ids.includes("business"));
});

test("a student skill that stands on another version of its app parent is noticed", () => {
  const lib = createLibrary([]);
  assert.equal(lib.parentChanged({ parent: "business", parentVersion: 2 }), true);
  assert.equal(lib.parentChanged({ parent: "business", parentVersion: 1 }), false);
  assert.equal(lib.parentChanged({ parent: "", parentVersion: 1 }), false);
});

test("a student skill needs an id, a name and a kind and may not take the id of an app skill", () => {
  assert.equal(cleanUserSkill({ id: "critic", kind: "role", name: "x" }), null);
  assert.equal(cleanUserSkill({ id: "ok", kind: "role", name: " " }), null);
  assert.equal(cleanUserSkill({ id: "ok", kind: "bad", name: "x" }), null);
  assert.equal(cleanUserSkill({ id: "ok", kind: "role", name: " x " }).name, "x");
});

test("entries are refreshed from the library and a skill that is gone keeps its snapshot", () => {
  const lib = createLibrary([user("mine", "styl", { text: "New text." })]);
  const out = refreshEntries(lib, [{ id: "mine", kind: "styl", name: "old", text: "Old." }, { id: "gone", kind: "styl", name: "gone", text: "Kept." }]);
  assert.equal(out.find((e) => e.id === "mine").text, "New text.");
  assert.equal(out.find((e) => e.id === "gone").text, "Kept.");
});

test("a choice of skills turns into entries and back, and what is not in the library stays as extra", () => {
  const lib = createLibrary([user("mine", "styl")]);
  const entries = selectionEntries(lib, { role: "critic", postup: "", styles: ["mine", "business"], params: { business: "th" } });
  assert.deepEqual(entries.map((e) => e.id), ["critic", "mine", "business"]);
  const { selection, extra } = selectionOf(lib, [...entries, { id: "x", kind: "styl", name: "x", text: "x" }]);
  assert.equal(selection.role, "critic");
  assert.equal(selection.params.business, "th");
  assert.equal(extra.length, 1);
  assert.equal(selectionEntries(lib, { role: "mine", postup: "", styles: [], params: {} }).length, 0, "a skill of another kind than its place is left out");
});

test("the defaults are cleaned to known agent types and known fields", () => {
  const out = cleanDefaults({ researcher: { role: "critic", styles: ["business", "business"], params: { business: "xx" } }, ghost: { role: "critic" }, writer: {} }, types);
  assert.deepEqual(Object.keys(out), ["researcher"]);
  assert.deepEqual(out.researcher.styles, ["business"]);
  assert.deepEqual(out.researcher.params, {});
  assert.deepEqual(cleanDefaults("junk", types), {});
  assert.equal(defaultEntries(createLibrary([]), out, "researcher").length, 2);
});

test("the store keeps skills, refuses duplicates, protects a parent that has children and cleans defaults on delete", () => {
  const storage = memory();
  const store = createSkillsStore(storage);
  const a = store.add({ kind: "styl", name: "A", text: "a" });
  assert.ok(a.id);
  const b = store.add({ kind: "styl", name: "B", text: "b", parent: a.id });
  assert.equal(store.library().get(b.id).parent, a.id);
  assert.equal(store.add({ ...a }), null);
  assert.equal(store.remove(a.id), false, "a skill with children is kept");
  store.setDefaults("researcher", { role: "", postup: "", styles: [b.id], params: {} });
  assert.deepEqual(store.defaults().researcher.styles, [b.id]);
  assert.equal(store.remove(b.id), true);
  assert.equal(store.defaults().researcher, undefined);
  assert.equal(createSkillsStore(storage).library().users().length, 1, "a new store reads what was saved");
});

test("the store updates a skill and never throws on broken or blocked storage", () => {
  const store = createSkillsStore(memory());
  const a = store.add({ kind: "role", name: "A", text: "a" });
  assert.equal(store.update({ ...a, name: "A2" }).name, "A2");
  assert.equal(store.update({ id: "ghost", kind: "role", name: "x" }), null);
  const broken = createSkillsStore({ getItem: () => "{not json", setItem: () => { throw new Error("full"); } });
  assert.equal(broken.library().users().length, 0);
  assert.doesNotThrow(() => broken.add({ kind: "styl", name: "x", text: "x" }));
  assert.ok(broken.changes() >= 1);
});

test("the library of a student is limited", () => {
  const store = createSkillsStore(memory());
  for (let i = 0; i < USER_SKILLS_MAX; i += 1) assert.ok(store.add({ kind: "styl", name: `s${i}`, text: "t" }));
  assert.equal(store.add({ kind: "styl", name: "one more", text: "t" }), null);
});

test("a new agent starts with the default skills of its type, but a loaded definition keeps what it says", () => {
  const lib = createLibrary([]);
  setDefaultSkills((agent) => (agent === "researcher" ? defaultEntries(lib, { researcher: { role: "critic", postup: "", styles: [], params: {} } }, agent) : []));
  try {
    const ed = createEditor("sequential");
    const node = ed.addNode("researcher");
    assert.equal(ed.design().nodes.find((n) => n.id === node.id)?.skills?.[0]?.id ?? ed.design().nodes.at(-1).skills?.[0]?.id, "critic");
    const loaded = createEditor("sequential");
    loaded.addNode("researcher", { skills: undefined });
    assert.equal(loaded.design().nodes.at(-1).skills, undefined);
    loaded.setNode(loaded.design().nodes.at(-1).id, { skills: [entry("styl", "s")] });
    assert.equal(loaded.design().nodes.at(-1).skills.length, 1);
    loaded.setNode(loaded.design().nodes.at(-1).id, { skills: [] });
    assert.equal("skills" in loaded.design().nodes.at(-1), false);
  } finally {
    setDefaultSkills(null);
  }
});

test("the tab Skills is there only when skills are on offer", () => {
  assert.ok(agentTabIds({ notebookOn: false, skillsOk: true }).includes("skills"));
  assert.ok(!agentTabIds({ notebookOn: false }).includes("skills"));
});
