import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSection } from "../public/js/help-topics.js";

const read = (lang) => JSON.parse(readFileSync(new URL(`../public/locales/${lang}.json`, import.meta.url), "utf8"));
const en = read("en");
const cs = read("cs");

const KEYS = [
  "create.step.setup", "create.step.diagram", "create.step.check", "create.step.locked",
  "create.status.none", "create.status.part", "create.status.done", "create.status.locked",
  "create.part.task", "create.part.pattern", "create.part.provider", "create.part.memory",
  "create.back", "create.next", "create.describe", "create.chooseProviderFirst", "create.chooseModel",
  "create.memoryOff", "create.memoryOn",
  "create.tab.agents", "create.tab.limits", "create.tab.cost", "create.tab.key",
  "create.col.agent", "create.col.model", "create.col.modelName", "create.col.paid", "create.col.search",
  "create.paidYes", "create.paidNo", "create.searchOn", "create.searchOff", "create.limitsPlaceholder",
  "create.hint.setup", "create.hint.missing", "create.hint.ready",
  "create.missing.diagram", "create.missing.limits", "create.missing.key", "create.costNeeds", "create.noProviders", "create.ws.noEstimate", "create.ws.locked", "create.ws.estimate",
];
// The same word in both languages.
const SAME = new Set(["create.step.diagram", "create.col.agent"]);

test("every text of the Create steps exists in both languages and Czech is translated", () => {
  for (const k of KEYS) {
    assert.ok(typeof en[k] === "string" && en[k].length > 0, `en ${k}`);
    assert.ok(typeof cs[k] === "string" && cs[k].length > 0, `cs ${k}`);
    if (!SAME.has(k)) assert.notEqual(cs[k], en[k], `cs ${k} is not translated`);
  }
});

test("texts with a placeholder keep it in both languages", () => {
  assert.match(en["create.hint.missing"], /\{items\}/);
  assert.match(cs["create.hint.missing"], /\{items\}/);
  assert.match(en["create.limitsPlaceholder"], /\{value\}/);
  assert.match(cs["create.limitsPlaceholder"], /\{value\}/);
  assert.match(en["create.ws.estimate"], /\{usd\}/);
  assert.match(cs["create.ws.estimate"], /\{usd\}/);
});

test("the Providers section of Help exists in both languages and its related sections exist", () => {
  for (const [lang, locale] of [["en", en], ["cs", cs]]) {
    const found = findSection(locale["help.body"], "create-provider");
    assert.ok(found, `${lang}: no create-provider`);
    for (const id of found.section.related) assert.ok(findSection(locale["help.body"], id), `${lang}: related ${id}`);
  }
});

test("the new Create texts say student, never learner", () => {
  for (const k of KEYS) assert.doesNotMatch(en[k], /learner/i, k);
});
