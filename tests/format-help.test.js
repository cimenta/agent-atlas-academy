import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSection } from "../public/js/help-topics.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");

test("the Help section Answer format exists in both languages", () => {
  for (const l of ["en", "cs"]) {
    const body = JSON.parse(read(`../public/locales/${l}.json`))["help.body"];
    const section = findSection(body, "answer-format");
    assert.ok(section, `${l} section`);
    assert.ok(section.section.text.includes("format.invalid"), `${l} names the error`);
  }
});

test("the Learn article Structured output names the three ways in both languages", () => {
  for (const [l, words] of [["en", ["prompt", "repair", "schema"]], ["cs", ["prompt", "oprav", "schéma"]]]) {
    const md = read(`../public/content/articles/${l}/structured-output.md`).toLowerCase();
    for (const w of words) assert.ok(md.includes(w), `${l} ${w}`);
    assert.ok(md.includes("#/learn/retries-and-errors") || md.includes("(#/learn/guardrails)"), `${l} links`);
  }
});
