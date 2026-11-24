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

test("the detail shows the title, the facts and the sections in the order of the tabs: about, settings", () => {
  const box = make();
  const text = box.text.replace(/\s+/g, " ");
  const at = (s) => text.lastIndexOf(s);
  const names = ["What the student learns", "What it is about", "Settings", "How it works", "What to watch for in the replay", "Related articles"];
  assert.ok(at("One task, two models") >= 0);
  for (const s of names) assert.ok(at(s) >= 0, s);
  assert.ok(at("What the student learns") < at("What it is about"), "the tabs come after what the student learns");
  assert.ok(at("How it works") < at("What to watch for in the replay") && at("What to watch for in the replay") < at("Related articles"));
  assert.match(text, /About text/);
  assert.doesNotMatch(text, /MISSING|undefined|\{\w+\}/);
});

test("a tab does not repeat its own name inside: only the tab buttons say What it is about and Settings", () => {
  const box = make();
  const headings = box.find((e) => e.tag === "h3").map((e) => e.text);
  assert.ok(!headings.includes("What it is about"));
  assert.ok(!headings.includes("Settings"));
  assert.ok(headings.includes("How it works") && headings.includes("What to watch for in the replay"));
  const tabs = box.find((e) => e.attrs.role === "tab").map((e) => e.text);
  assert.ok(tabs.includes("What it is about") && tabs.includes("Settings"));
});

test("a tag and an agent of the diagram explain themselves on hover and with the keyboard", () => {
  const box = make({ tagInfo: (tag) => ({ text: `about ${tag}`, badge: "3 runs" }), item: { ...item, tags: ["handoff", "speed", "cost"] } });
  const tag = box.find((e) => e.attrs["data-ui"] === "detail-tag")[0];
  assert.equal(tag.attrs["data-hover-title"], "handoff");
  assert.equal(tag.attrs["data-hover-text"], "about handoff");
  assert.equal(tag.attrs["data-hover-badge"], "3 runs");
  assert.equal(tag.attrs.tabindex, "0");
  const agents = box.find((e) => e.tag === "b" && e.attrs["data-hover-title"]);
  assert.deepEqual(agents.map((e) => e.attrs["data-hover-title"]), ["planner", "writer"]);
  assert.equal(agents[0].attrs["data-hover-badge"], "Agent 1 of 2");
  assert.deepEqual(JSON.parse(agents[0].attrs["data-hover-rows"]), [["Provider and model", "Groq · openai/gpt-oss-20b"]]);
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
  const buttons = make({ actions }).find((e) => e.tag === "button" && e.attrs.role !== "tab");
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

test("the time of the run and its study time are chips before the tags, and a tab opens its pane only", () => {
  const view = make({ item: { ...item, tags: ["basics"], studyMinutes: 7.4 }, facts: { ...facts, seconds: 63 } });
  const meta = view.find((e) => e.attrs["data-ui"] === "detail-meta")[0];
  assert.ok(meta, "one row for time and tags");
  const kinds = meta.children.map((c) => c.attrs?.["data-ui"]);
  assert.deepEqual(kinds, ["detail-time-run", "detail-time-study", "detail-tags"]);
  assert.match(meta.text, /63 s/);
  assert.match(meta.text, /about 7 min/);
  const runChip = view.find((e) => e.attrs["data-ui"] === "detail-time-run")[0];
  assert.equal(runChip.attrs.title, en["library.detail.runTime"]);
  assert.match(make({ item, facts: { ...facts, seconds: 150 } }).text, /2 min 30 s/);
  assert.equal(view.find((e) => e.attrs["data-ui"] === "detail-time-study").length, 1);
  assert.equal(make({ facts: { ...facts, seconds: 0 } }).find((e) => String(e.attrs["data-ui"]).startsWith("detail-time-")).length, 0, "no time chip when nothing is known");
});

const isHidden = (p) => (p.hidden !== undefined ? p.hidden : p.attrs.hidden !== undefined);
test("there are tabs About, Settings and, with a note, About the pattern (About this run for your own run); a click shows one pane", () => {
  const panel = new El("section");
  const lib = make({ aboutPanel: panel });
  const tabs = lib.find((e) => e.attrs.role === "tab");
  assert.deepEqual(tabs.map((e) => e.text), ["What it is about", "Settings", "About the pattern"]);
  assert.deepEqual(tabs.map((e) => e.attrs["aria-selected"]), ["true", "false", "false"]);
  const panes = lib.find((e) => e.attrs.role === "tabpanel");
  assert.deepEqual(panes.map((p) => isHidden(p)), [false, true, true]);
  assert.ok(panes[2].children.includes(panel), "the note is in the last pane");
  tabs[2].listeners.click();
  assert.deepEqual(panes.map((p) => isHidden(p)), [true, true, false]);
  assert.deepEqual(tabs.map((e) => e.attrs["aria-selected"]), ["false", "false", "true"]);
  const own = make({ source: "local", aboutPanel: panel }).find((e) => e.attrs.role === "tab");
  assert.equal(own.at(-1).text, "About this run");
  assert.deepEqual(make({}).find((e) => e.attrs.role === "tab").map((e) => e.text), ["What it is about", "Settings"]);
  assert.match(make({ aboutPanel: panel }, cs).find((e) => e.attrs.role === "tab").map((e) => e.text).join("|"), /O čem to je|Nastavení|O vzoru/);
});
