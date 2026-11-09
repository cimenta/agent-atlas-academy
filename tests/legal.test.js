import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFrontMatter, parseMarkdown } from "../public/js/markdown.js";

const root = new URL("../public/", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

for (const lang of ["en", "cs"]) {
  const noCookies = JSON.parse(read(`locales/${lang}.json`))["legal.noCookies"];
  for (const name of ["privacy", "terms", "imprint"]) {
    test(`${lang}/${name} exists and has a heading`, () => {
      const { body } = parseFrontMatter(read(`content/pages/${lang}/${name}.md`));
      assert.ok(parseMarkdown(body).some((block) => block.type === "heading"));
    });
  }
  test(`${lang}/privacy mentions aa.lang and says there are no cookies`, () => {
    const text = read(`content/pages/${lang}/privacy.md`);
    assert.ok(text.includes("aa.lang"));
    assert.ok(text.toLowerCase().includes(noCookies.toLowerCase()));
  });
}
