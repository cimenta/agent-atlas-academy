import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { modelGoneView } from "../public/js/create/model-gone-view.js";
import { compareFree } from "../public/js/engine/free-check.js";
import { modelsOfSlot } from "../public/js/engine/providers.js";
import { canRun, blockedByGoneModel } from "../public/js/create/create-model.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; }
  setAttribute(k, v) { this.attrs[k] = v; }
  removeAttribute(k) { delete this.attrs[k]; }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  append(...nodes) { this.children.push(...nodes); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(""); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const tOf = (dict) => (key, params = {}) => String(dict[key] ?? `MISSING ${key}`).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
const ui = (view, name) => view.find((e) => e.attrs["data-ui"] === name);

const slotModels = modelsOfSlot("openrouter-free");
const FREE = slotModels.map((m) => m.id);
const live = (ids, extra = []) => ({ ids: [...ids, ...extra.map((m) => m.id)], models: [...ids.map((id) => ({ id, name: id, tools: true, forcedFormat: true })), ...extra] });
const cand = (id, name, forcedFormat = true) => ({ id, name, tools: true, forcedFormat });
const tierName = (key) => ({ fast: "Fast", balanced: "Balanced", strong: "Strong" })[key];
const build = (dict, result, extra = {}) => modelGoneView({ doc, t: tOf(dict), result, tierName, slotName: "OpenRouter free", subText: "free tier", onPick() {}, ...extra });

const okResult = { check: compareFree({ slotModels, live: live(FREE), overrides: {} }), ageMin: 2, overrides: {} };
const goneResult = { check: compareFree({ slotModels, live: live(FREE.slice(0, 2), [cand("google/gemma-4-31b-it:free", "Gemma 4 31B"), cand("nvidia/nemotron-3.5-lightning:free", "Nemotron Lightning", false)]), overrides: {} }), ageMin: 0, overrides: {} };
const unknownResult = { check: compareFree({ slotModels, live: null, overrides: {} }), ageMin: null, overrides: {} };

test("all present: one quiet line with the minutes and nothing else", () => {
  for (const dict of [en, cs]) {
    const v = build(dict, okResult);
    assert.equal(ui(v, "model-check-ok").length, 1);
    assert.match(v.text, /\b2\b/);
    assert.doesNotMatch(v.text, /MISSING|\{\w+\}/);
    assert.equal(ui(v, "model-gone").length, 0);
    assert.equal(ui(v, "model-check-unknown").length, 0);
  }
  assert.match(build(en, { ...okResult, ageMin: 0 }).text, /MISSING|just now/);
});

test("a vanished model: the error, the pick list with the candidates, the note for one without forced format", () => {
  for (const dict of [en, cs]) {
    const v = build(dict, goneResult);
    assert.equal(ui(v, "model-gone").length, 1);
    assert.doesNotMatch(v.text, /MISSING|\{\w+\}/);
    assert.match(v.text, /nvidia\/nemotron-3-ultra-550b-a55b:free/);
    assert.match(v.text, /Strong|Silný|Strong/);
    const radios = v.find((e) => e.tag === "input" && e.attrs.type === "radio");
    // the models still present count as candidates too (the mockup lists the model of another tier), each id once
    assert.deepEqual(radios.map((r) => r.attrs.value).sort(), ["google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free", "nvidia/nemotron-3.5-lightning:free"]);
    assert.match(v.text, new RegExp(dict["create.modelGone.noForced"].slice(0, 12).replace(/[()]/g, ".")));
    assert.equal(ui(v, "model-check-ok").length, 0);
  }
  assert.notEqual(en["create.modelGone.title.one"], cs["create.modelGone.title.one"]);
});

test("the button is disabled until a radio is chosen, then hands the tier and id to onPick", () => {
  const picked = [];
  const v = build(en, goneResult, { onPick: (key, id) => picked.push([key, id]) });
  const button = ui(v, "model-gone-use")[0];
  assert.notEqual(button.attrs.disabled, undefined);
  button.listeners.click?.();
  assert.deepEqual(picked, []);
  const radio = v.find((e) => e.tag === "input" && e.attrs.type === "radio" && e.attrs.value === "google/gemma-4-31b-it:free")[0];
  radio.listeners.change();
  assert.equal(button.attrs.disabled, undefined);
  button.listeners.click();
  assert.deepEqual(picked, [["strong", "google/gemma-4-31b-it:free"]]);
});

test("no candidate with tools: the view says so and offers no button that does nothing", () => {
  const noTools = { ids: FREE.slice(0, 2), models: FREE.slice(0, 2).map((id) => ({ id, name: id, tools: false, forcedFormat: false })) };
  const none = { check: compareFree({ slotModels, live: noTools, overrides: {} }), ageMin: 0, overrides: {} };
  for (const dict of [en, cs]) {
    const v = build(dict, none);
    assert.equal(ui(v, "model-gone").length, 1);
    assert.equal(v.find((e) => e.tag === "input").length, 0);
    assert.doesNotMatch(v.text, /MISSING/);
    assert.match(v.text, new RegExp(dict["create.modelGone.none"].slice(0, 10)));
  }
});

test("several vanished models get one pick list each", () => {
  const many = { check: compareFree({ slotModels, live: live([], [cand("a/b:free", "A"), cand("c/d:free", "C")]), overrides: {} }), ageMin: 0, overrides: {} };
  const v = build(en, many);
  assert.equal(ui(v, "model-gone-use").length, 3);
  assert.match(v.text, /3/);
});

test("the check could not run: a warning and the run is allowed", () => {
  for (const dict of [en, cs]) {
    const v = build(dict, unknownResult);
    assert.equal(ui(v, "model-check-unknown").length, 1);
    assert.doesNotMatch(v.text, /MISSING|\{\w+\}/);
    assert.equal(ui(v, "model-gone").length, 0);
  }
});

test("a chosen model is named once the tier is fine again", () => {
  const chosen = { check: compareFree({ slotModels, live: live(FREE.slice(0, 2), [cand("google/gemma-4-31b-it:free", "Gemma")]), overrides: { strong: "google/gemma-4-31b-it:free" } }), ageMin: 1, overrides: { strong: "google/gemma-4-31b-it:free" } };
  for (const dict of [en, cs]) {
    const v = build(dict, chosen);
    assert.equal(ui(v, "model-check-ok").length, 1);
    assert.equal(ui(v, "model-gone-used").length, 1);
    assert.match(v.text, /google\/gemma-4-31b-it:free/);
    assert.doesNotMatch(v.text, /MISSING|\{\w+\}/);
  }
});

test("a model name from the list is shown as text, never as markup", () => {
  const evil = { check: compareFree({ slotModels, live: live(FREE.slice(0, 2), [cand("a/b:free", "<img src=x onerror=alert(1)>")]), overrides: {} }), ageMin: 0, overrides: {} };
  const v = build(en, evil);
  assert.equal(v.find((e) => e.tag === "img").length, 0);
});

test("a run is blocked only for an agent on a gone tier without an override", () => {
  const node = (id, slot, model) => ({ id, agent: "writer", model, search: false, slot });
  const design = { pattern: "sequential", nodes: [node("a", "openrouter-free", "fast"), node("b", "openrouter-free", "strong"), node("c", "groq-free", "strong")], edges: [] };
  assert.equal(blockedByGoneModel(design, goneResult.check), true);
  assert.equal(blockedByGoneModel({ ...design, nodes: [design.nodes[0], design.nodes[2]] }, goneResult.check), false);
  assert.equal(blockedByGoneModel(design, okResult.check), false);
  assert.equal(blockedByGoneModel(design, unknownResult.check), false);
  assert.equal(blockedByGoneModel(design, null), false);
  assert.deepEqual(canRun({ task: "x", apiKey: "k", editorErrors: [], modelGone: true }).reasons, ["modelGone"]);
  assert.equal(canRun({ task: "x", apiKey: "k", editorErrors: [] }).ok, true);
});

test("every new text exists in both languages, Czech differs, and the params match", () => {
  const keys = Object.keys(en).filter((k) => k.startsWith("create.modelGone.") || k.startsWith("create.modelCheck.") || k === "create.reason.modelGone");
  assert.ok(keys.length >= 12, `only ${keys.length} keys`);
  const names = (s) => (String(s).match(/\{(\w+)\}/g) ?? []).sort().join();
  for (const k of keys) {
    assert.equal(typeof cs[k], "string", `cs ${k}`);
    assert.notEqual(en[k], cs[k], `cs differs ${k}`);
    assert.equal(names(en[k]), names(cs[k]), `params ${k}`);
  }
});
