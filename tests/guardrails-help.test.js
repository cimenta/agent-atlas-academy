import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSection } from "../public/js/help-topics.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the Help section Guardrails exists in both languages and covers the four kinds", () => {
  for (const [l, words] of [["en", ["secret", "forbidden words", "too long", "reviewing model"]], ["cs", ["tajný", "zakázaná slova", "příliš dlouh", "kontrolující model"]]]) {
    const body = JSON.parse(read(`../public/locales/${l}.json`))["help.body"];
    const section = findSection(body, "guardrails");
    assert.ok(section, `${l} section`);
    const text = section.section.text.toLowerCase();
    for (const w of words) assert.ok(text.includes(w), `${l} ${w}`);
    assert.ok(text.includes("guardrail.blocked"), `${l} names the error`);
    assert.ok(/prompt injection|prompt injection/i.test(section.section.text), `${l} links to prompt injection`);
  }
});

test("the Learn article Guardrails is written in both languages and no longer marked coming", () => {
  for (const l of ["en", "cs"]) {
    const md = read(`../public/content/articles/${l}/guardrails.md`);
    assert.ok(!/^coming:/m.test(md), `${l} still marked coming`);
    assert.ok(md.includes("(#/learn/prompt-injection)") && md.includes("(#/learn/structured-output)") && md.includes("(#/learn/human-approval)"), `${l} links`);
    assert.ok(!/are not part of Agent Atlas yet|nejsou součástí Agent Atlas/.test(md), `${l} says the checks are missing`);
  }
});

test("the editor tab links to the Help section", () => {
  assert.match(read("../public/js/create/editor-view.js"), /id: "guardrails"/);
});
