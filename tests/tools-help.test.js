import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSection } from "../public/js/help-topics.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const locales = { en: JSON.parse(read("../public/locales/en.json")), cs: JSON.parse(read("../public/locales/cs.json")) };

test("Help explains the tools of the app in both languages, and every section it relates to exists", () => {
  for (const [lang, locale] of Object.entries(locales)) {
    for (const id of ["create-tools", "create-documents", "create-notes-tool", "harness-own-tools", "replay-steps", "create-limits", "library"]) {
      const found = findSection(locale["help.body"], id);
      assert.ok(found, `${lang}: no section ${id}`);
      for (const rid of found.section.related) assert.ok(findSection(locale["help.body"], rid), `${lang}: ${id} relates to missing ${rid}`);
    }
    assert.ok(locale["harness.ownToolsName"], `${lang}: harness.ownToolsName`);
  }
});

test("the help buttons of the Tools tab and of the tools master switch point at the new sections", () => {
  assert.match(read("../public/js/create/tools-pane.js"), /id: "create-documents"/);
  assert.match(read("../public/js/create/tools-pane.js"), /id: "create-tools"/);
  assert.match(read("../public/js/settings-page.js"), /help\("harness-own-tools"/);
});

test("the tool section names every tool of the app, and no article still says there is only web search", () => {
  const names = { en: ["Calculator", "Date and time", "Wikipedia", "Weather", "Text counting", "Search in my documents", "Notes of the run"], cs: ["Kalkulačka", "Datum a čas", "Wikipedie", "Počasí", "Počítání textu", "Hledání v mých dokumentech", "Poznámky běhu"] };
  for (const [lang, list] of Object.entries(names)) {
    const section = findSection(locales[lang]["help.body"], "create-tools").section;
    const text = JSON.stringify(section);
    for (const name of list) assert.ok(text.includes(name), `${lang}: create-tools does not name ${name}`);
  }
  const stale = [/Today there is one/, /is coming/, /offers only a read-only web search/, /offers only a read-only/, /Dnes je jen jeden/, /se připravuje/, /nabízí jen vyhledávání/];
  for (const lang of ["en", "cs"]) {
    for (const slug of ["tools", "least-privilege", "tool-permissions-and-sandboxing"]) {
      const text = read(`../public/content/articles/${lang}/${slug}.md`);
      for (const re of stale) assert.ok(!re.test(text), `${lang}/${slug}: ${re}`);
    }
    assert.ok(!/Today there is one|Dnes je jen jeden/.test(locales[lang]["help.body"]), `${lang}: Help still says there is one tool`);
    assert.match(read(`../public/content/articles/${lang}/tools.md`), /tool_use/);
  }
});
