import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { libraryDetail } from "../public/js/library-detail.js";
import { actionList } from "../public/js/library-model.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  append(...nodes) { this.children.push(...nodes); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(" "); }
}
const doc = { createElement: (tag) => new El(tag), createElementNS: (ns, tag) => new El(tag), createTextNode: (text) => ({ text }) };
const tOf = (dict) => (key, params = {}) => String(dict[key] ?? `MISSING ${key}`).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
const facts = { pattern: "sequential", language: "en", agents: 2, providers: ["groq"], models: [{ agent: "planner", provider: "groq", model: "openai/gpt-oss-20b" }, { agent: "writer", provider: "groq", model: "openai/gpt-oss-120b" }], limits: { maxSteps: 20, maxTokens: 40000, maxSearches: 3 }, hasApiLog: true, calls: 3, outcome: "finished" };
const item = { id: "r1", title: "One task, two models", pattern: "sequential", source: "gallery" };
const detail = { about: "About text", how: "How text", learns: "Learns text", watch: "Watch text", articles: [{ slug: "choosing-a-model", title: "Choosing a model" }] };
const make = (over = {}, dict = en) => libraryDetail({ doc, t: tOf(dict), item, run: { design: { pattern: "sequential", nodes: [{ id: "planner" }, { id: "writer" }], edges: [{ from: "planner", to: "writer" }] } }, source: "gallery", detail, facts, actions: [{ ui: "load", label: "Load", primary: true, onClick() {} }], ...over });

test("the detail shows the title, the facts and the sections in the order of the mockup", () => {
  const text = make().text.replace(/\s+/g, " ");
  const at = (s) => text.indexOf(s);
  const names = ["What it is about", "How it works", "What the student learns", "What to watch for in the replay", "Settings", "Related articles"];
  assert.ok(at("One task, two models") >= 0);
  for (const s of names) assert.ok(at(s) >= 0, s);
  const order = names.map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.match(text, /About text/);
  assert.doesNotMatch(text, /MISSING|undefined|\{\w+\}/);
});

test("a section with no text is left out, and a run with no detail file still shows its facts", () => {
  const partial = make({ detail: { about: "Only this" } }).text;
  assert.match(partial, /What it is about/);
  assert.doesNotMatch(partial, /What the student learns|What to watch for|Related articles/);
  const bare = make({ detail: null });
  assert.match(bare.text, /Settings/);
  assert.match(bare.text, /This run has no written explanation yet/);
  assert.doesNotMatch(bare.text, /undefined|MISSING/);
});

test("the Settings section has one row per agent with its provider and model, the limits and the API log", () => {
  const box = make();
  const rows = box.find((e) => e.tag === "tr");
  assert.equal(rows.length, 3, "header and two agents");
  assert.match(box.text, /openai\/gpt-oss-120b/);
  assert.match(box.text, /steps 20/);
  assert.match(box.text, /calls: 3/);
  assert.match(make({ facts: { ...facts, hasApiLog: false, calls: 0 } }).text, /No API log/);
});

test("the buttons of the actions are in the detail, the first one marked primary", () => {
  const buttons = make().find((e) => e.tag === "button");
  assert.equal(buttons[0].attrs["data-ui"], "detail-load");
  assert.match(String(buttons[0].attrs.class), /primary/);
});

test("the actions of a library run and of your own run", () => {
  assert.deepEqual(actionList({ source: "gallery", hasDefinition: true, canSubmit: false }), ["load", "use-in-create", "export", "compare"]);
  assert.deepEqual(actionList({ source: "gallery", hasDefinition: false, canSubmit: false }), ["load", "export", "compare"]);
  assert.deepEqual(actionList({ source: "local", hasDefinition: true, canSubmit: true }), ["load", "use-in-create", "export", "compare", "send", "delete", "edit-description"]);
  assert.deepEqual(actionList({ source: "local", hasDefinition: true, canSubmit: false }), ["load", "use-in-create", "export", "compare", "delete", "edit-description"]);
});

test("the detail texts exist in both languages, differ, and share their parameter names", () => {
  const keys = Object.keys(en).filter((k) => k.startsWith("library."));
  assert.ok(keys.length >= 25, `only ${keys.length} library keys`);
  const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
  for (const k of keys) {
    assert.equal(typeof cs[k], "string", k);
    assert.equal(names(en[k]), names(cs[k]), k);
    assert.notEqual(en[k], cs[k], k);
  }
  assert.match(make({}, cs).text, /O čem to je/);
});

test("only Load has words; the other buttons are icons with a name and a tooltip, and Delete comes last", () => {
  const actions = actionList({ source: "local", hasDefinition: true, canSubmit: true }).map((ui) => ({ ui, label: `L-${ui}`, primary: ui === "load", danger: ui === "delete", onClick() {} }));
  const buttons = make({ actions }).find((e) => e.tag === "button");
  assert.equal(buttons.at(-1).attrs["data-ui"], "detail-delete");
  assert.ok(buttons.findIndex((b) => b.attrs["data-ui"] === "detail-edit-description") < buttons.length - 1);
  assert.ok(buttons[0].text.includes("L-load"));
  for (const b of buttons.slice(1)) {
    assert.equal(b.attrs["aria-label"], b.attrs["data-ui"] === undefined ? undefined : `L-${b.attrs["data-ui"].slice(7)}`);
    assert.ok(b.attrs.title.startsWith("L-"), b.attrs.title);
    assert.doesNotMatch(b.text, /L-/);
  }
});

test("the detail shows the tags of the run under the facts, each word in the colour of its group", () => {
  const view = make({ item: { ...item, tags: ["basics", "speed", "tool-choice"] }, tagLabel: (x) => x.toUpperCase() });
  const words = view.find((e) => e.attrs["data-ui"] === "detail-tag");
  assert.deepEqual(words.map((e) => e.text), ["BASICS", "SPEED", "TOOL-CHOICE"]);
  assert.deepEqual(words.map((e) => e.attrs.class), ["tag-word tag-basics", "tag-word tag-efficiency", "tag-word tag-pattern"]);
  const row = view.find((e) => e.attrs["data-ui"] === "detail-tags");
  assert.equal(row.length, 1);
  assert.equal(make().find((e) => e.attrs["data-ui"] === "detail-tags").length, 0, "no row when the run has no tags");
});
