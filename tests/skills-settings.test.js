import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderSkillsSettings, SKILL_AGENT_TYPES } from "../public/js/skills-settings.js";
import { createSkillsStore } from "../public/js/storage/skills-store.js";
import { renderSettings } from "../public/js/settings-page.js";
import { createSettingsStore } from "../public/js/storage/settings.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const t = (k, p) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => p?.[n] ?? `{${n}}`);

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.value = ""; this.checked = false; this.textContent = ""; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === "value") this.value = v; if (k === "checked") this.checked = true; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(" "); }
  fire(type) { for (const fn of this.listeners[type] ?? []) fn(); }
}
let confirmAnswer = true;
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }), defaultView: { confirm: () => confirmAnswer } };
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) }; };
const ui = (root, name) => root.find((e) => e.attrs["data-ui"] === name)[0];
const click = (root, name) => ui(root, name).fire("click");

test("the library shows the app skills first and the three create buttons", () => {
  const root = renderSkillsSettings({ doc, t, store: createSkillsStore(memory()) });
  for (const id of ["critic", "summarizer", "planner-steps", "business"]) assert.ok(ui(root, `skill-item-${id}`), id);
  for (const kind of ["role", "postup", "styl"]) assert.ok(ui(root, `skills-new-${kind}`), kind);
  assert.ok(ui(root, "skill-extend"), "an app skill can be extended but not edited");
  assert.equal(ui(root, "skill-save"), undefined);
});

test("a new skill is saved to the store and selected, and the kind filter follows it", () => {
  const store = createSkillsStore(memory());
  const root = renderSkillsSettings({ doc, t, store });
  click(root, "skills-new-postup");
  assert.equal(store.library().users().length, 1);
  assert.equal(store.library().users()[0].kind, "postup");
  assert.ok(ui(root, "skill-save"));
  assert.equal(ui(root, "skills-filter-postup").attrs["aria-pressed"], "true");
});

test("saving writes the changes and an empty name is refused", () => {
  const store = createSkillsStore(memory());
  const root = renderSkillsSettings({ doc, t, store });
  click(root, "skills-new-styl");
  ui(root, "skill-name").value = "My tone";
  ui(root, "skill-name").fire("input");
  ui(root, "skill-text").value = "Be brief.";
  ui(root, "skill-text").fire("input");
  click(root, "skill-save");
  const saved = store.library().users()[0];
  assert.equal(saved.name, "My tone");
  assert.equal(saved.text, "Be brief.");
  click(root, `skill-item-${saved.id}`);
  ui(root, "skill-name").value = " ";
  ui(root, "skill-name").fire("input");
  click(root, "skill-save");
  assert.equal(store.library().users()[0].name, "My tone", "the empty name was not saved");
  assert.match(ui(root, "skills-message").text, /name/i);
});

test("extending an app skill makes a student skill on its version, and deleting asks first", () => {
  const store = createSkillsStore(memory());
  const root = renderSkillsSettings({ doc, t, store });
  click(root, "skill-item-business");
  click(root, "skill-extend");
  const child = store.library().users()[0];
  assert.equal(child.parent, "business");
  assert.equal(child.parentVersion, 1);
  confirmAnswer = false;
  click(root, "skill-delete");
  assert.equal(store.library().users().length, 1, "cancelled");
  confirmAnswer = true;
  click(root, "skill-delete");
  assert.equal(store.library().users().length, 0);
});

test("a skill with children can not be deleted", () => {
  const store = createSkillsStore(memory());
  const a = store.add({ kind: "styl", name: "A", text: "a" });
  store.add({ kind: "styl", name: "B", text: "b", parent: a.id });
  const root = renderSkillsSettings({ doc, t, store });
  click(root, `skill-item-${a.id}`);
  click(root, "skill-delete");
  assert.equal(store.library().users().length, 2);
  assert.ok(ui(root, "skills-message"));
});

test("a skill that stands on another version of its app parent shows a banner with a diff, and accepting moves it to the current one", () => {
  const store = createSkillsStore(memory());
  store.add({ id: "mine", kind: "styl", name: "Mine", text: "m", parent: "business", parentVersion: 2 });
  const root = renderSkillsSettings({ doc, t, store });
  click(root, "skill-item-mine");
  assert.ok(ui(root, "skill-parent-changed"));
  click(root, "skill-parent-diff");
  assert.match(ui(root, "skill-parent-changed").text, /business correspondence/);
  click(root, "skill-parent-accept");
  assert.equal(store.library().get("mine").parentVersion, 1);
  assert.equal(ui(root, "skill-parent-changed"), undefined);
});

test("the defaults tab has a card for every agent type that may have skills and keeps the choice", () => {
  const store = createSkillsStore(memory());
  const root = renderSkillsSettings({ doc, t, store });
  click(root, "skills-tab-defaults");
  assert.ok(SKILL_AGENT_TYPES.length > 0);
  for (const type of SKILL_AGENT_TYPES) assert.ok(ui(root, `skills-default-${type}`), type);
  const type = SKILL_AGENT_TYPES[0];
  const select = ui(ui(root, `skills-default-${type}`), "skills-role");
  select.value = "critic";
  select.fire("change");
  assert.equal(store.defaults()[type].role, "critic");
});

test("the Settings page has the tab Skills when the skills store is given", async () => {
  const proxy = () => new Proxy(function () {}, { get: (_, k) => (k === "children" || k === "childNodes" ? [] : k === Symbol.toPrimitive ? () => "" : k === "classList" ? { add() {}, remove() {}, toggle() {}, contains: () => false } : k === "style" ? {} : proxy()), set: () => true, apply: () => proxy() });
  const pdoc = { createElement: () => proxy(), createTextNode: (text) => ({ text }), title: "" };
  const mem = new Map();
  const settings = createSettingsStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) });
  const vault = { getSessionKey: () => null, hasStoredKey: () => false, hasKey: () => false, isUnlocked: () => false };
  await renderSettings({ doc: pdoc, main: { replaceChildren() {}, append() {} }, t, lang: "en", version: "x", fetchFn: async () => ({ ok: false }), vault, settings, runStore: {}, skills: createSkillsStore(memory()), tab: "skills", slot: "groq", isStale: () => false, onLeave() {} });
});
