import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSection, splitTopics } from "../public/js/help-topics.js";

const load = (lang) => JSON.parse(readFileSync(new URL(`../public/locales/${lang}.json`, import.meta.url), "utf8"));
const en = load("en");
const cs = load("cs");
const ids = (md) => splitTopics(md).flatMap((t) => t.sections.map((s) => s.id));

test("Help has the Library sections in both languages, with the same ids", () => {
  for (const id of ["library", "library-bundle", "library-keys"]) {
    assert.ok(findSection(en["help.body"], id), `en ${id}`);
    assert.ok(findSection(cs["help.body"], id), `cs ${id}`);
  }
  assert.deepEqual(ids(en["help.body"]), ids(cs["help.body"]));
});

test("the Help text of the keys names every key of the Library, in both languages", () => {
  for (const lang of [en, cs]) {
    const { section } = findSection(lang["help.body"], "library-keys");
    const text = JSON.stringify(section);
    for (const key of ["Enter", "Space", "Shift+E", "Delete", "Esc"]) assert.ok(text.includes(key), key);
    for (const letter of ["L", "C", "E", "U", "N", "Q", "B", "I", "O"]) assert.ok(new RegExp(`\\*\\*${letter}\\*\\*|\\b${letter}\\b`).test(text), letter);
  }
});

test("the three tabs of Play are described as four, with the Library first, and nothing says the library is on the left", () => {
  assert.match(en["help.body"], /\*\*Library\*\*/);
  assert.match(cs["help.body"], /\*\*Knihovna\*\*/);
  assert.doesNotMatch(en["help.body"], /library on the left/);
  assert.doesNotMatch(cs["help.body"], /knihovně vlevo/);
  assert.doesNotMatch(en["help.body"], /The cog on a run/);
  assert.doesNotMatch(cs["help.body"], /Ozubené kolo u běhu/);
});
