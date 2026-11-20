import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSection } from "../public/js/help-topics.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));
const page = read("../public/js/settings-page.js");

const KEYS = ["settings.checkModels", "settings.checkModelsHint", "settings.checkAll", "settings.checkAllHint", "settings.checkRunning", "settings.checkTitle", "settings.checkAvailable", "settings.checkMissing", "settings.checkOthers", "settings.checkAllOk", "settings.checkAllMissing", "settings.checkSkipped", "settings.checkNoKey", "settings.checkWarnMissing", "settings.checkError.rejected", "settings.checkError.unreachable", "settings.checkError.rate_limit", "settings.checkError.bad_key", "settings.checkError.bad_provider"];

test("the buttons and their places exist on the Settings page", () => {
  for (const ui of ["check-models-", "check-result-", "check-all-models", "check-all-result"]) assert.ok(page.includes(`"${ui}`) || page.includes(`\`${ui}`) || page.includes(ui), `missing ${ui}`);
  assert.match(page, /data-ui": `check-models-\$\{id\}`/);
  assert.match(page, /data-ui": `check-result-\$\{id\}`/);
  assert.match(page, /"data-ui": "check-all-models"/);
  assert.match(page, /"data-ui": "check-all-result"/);
});

test("the global button sits in the Keys section, above the provider tabs", () => {
  const section = page.slice(page.indexOf('h(doc, "h2", {}, t("settings.tabKeys")'));
  assert.ok(section.indexOf("checkAllBox") > 0 && section.indexOf("checkAllBox") < section.indexOf("providerTabs"), "checkAllBox comes before providerTabs");
  assert.ok(section.indexOf('t("settings.keyIntro")') < section.indexOf("checkAllBox"), "after the intro text");
});

test("the texts exist in both languages and Czech differs from English", () => {
  for (const k of KEYS) {
    assert.equal(typeof en[k], "string", `en ${k}`);
    assert.equal(typeof cs[k], "string", `cs ${k}`);
    assert.notEqual(en[k], cs[k], `${k} is the same in both languages`);
    const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    assert.equal(params(en[k]), params(cs[k]), `${k} uses other parameters in Czech`);
  }
  assert.deepEqual([...en["settings.checkTitle"].matchAll(/\{(\w+)\}/g)].map((m) => m[1]), ["n"]);
  assert.deepEqual([...en["settings.checkAllMissing"].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), ["ids", "missing", "n"]);
});

test("Help on the keys mentions the check, in both languages with different words", () => {
  const a = findSection(en["help.body"], "settings-keys").section;
  const b = findSection(cs["help.body"], "settings-keys").section;
  assert.match(JSON.stringify(a), /Check models/);
  assert.match(JSON.stringify(b), /Zkontrolovat modely/);
});

test("the tier names of the check rows are translated, not taken from the English registry", () => {
  for (const tier of ["fast", "balanced", "strong"]) {
    assert.equal(typeof en[`settings.tier.${tier}`], "string");
    assert.notEqual(en[`settings.tier.${tier}`], cs[`settings.tier.${tier}`], `tier ${tier} is the same in both languages`);
  }
  assert.match(page, /settings\.tier\.\$\{row\.tier\}/);
  assert.doesNotMatch(page, /check-tier" \}, row\.label/);
});

test("the Czech all-available line is grammatical for 1, 2 and 3 models", () => {
  assert.doesNotMatch(cs["settings.checkAllOk"], /všech \{n\} modelů je/);
});
