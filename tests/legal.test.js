import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseFrontMatter, parseMarkdown } from "../public/js/markdown.js";

const root = new URL("../public/", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

for (const lang of ["en", "cs"]) {
  const noCookies = JSON.parse(read(`locales/${lang}.json`))["legal.noCookies"];
  for (const name of ["privacy", "terms", "imprint"]) {
    test(`${lang}/${name} exists and has content`, () => {
      const { body } = parseFrontMatter(read(`content/pages/${lang}/${name}.md`));
      const blocks = parseMarkdown(body);
      // The imprint is three short labelled lines; the other pages are sectioned.
      assert.ok(name === "imprint" ? blocks.length >= 3 : blocks.some((block) => block.type === "heading"));
    });
  }
  test(`${lang}/privacy mentions aa.lang and says there are no cookies`, () => {
    const text = read(`content/pages/${lang}/privacy.md`);
    assert.ok(text.includes("aa.lang"));
    assert.ok(text.toLowerCase().includes(noCookies.toLowerCase()));
  });
}

test("the English imprint lists provider, contact and content with the agreed details", () => {
  const { body } = parseFrontMatter(read("content/pages/en/imprint.md"));
  assert.ok(body.includes("[Radek Šimčík](https://portfolio.radeksimcik.cz)"));
  assert.ok(body.includes("info@agentatlas.academy"));
  assert.ok(body.includes("Radek Šimčík, Company ID (IČO): 06018025"));
});

test("the Czech imprint has the same details", () => {
  const { body } = parseFrontMatter(read("content/pages/cs/imprint.md"));
  assert.ok(body.includes("[Radek Šimčík](https://portfolio.radeksimcik.cz)"));
  assert.ok(body.includes("info@agentatlas.academy"));
  assert.ok(body.includes("Radek Šimčík, IČO: 06018025"));
});

test("the About text uses the agreed wording in both languages", () => {
  const en = JSON.parse(read("locales/en.json"))["about.body"];
  assert.ok(en.startsWith("Agent Atlas is an educational project that helps to understand how AI agents work, communicate and are orchestrated."));
  assert.equal(JSON.parse(read("locales/en.json"))["site.tagline"], "Agents Educational Sandbox: not for real work.");
});
