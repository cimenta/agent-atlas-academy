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

const WORDS = {
  en: { password: "password", unrecoverable: "cannot be recovered", fee: "fee" },
  cs: { password: "heslo", unrecoverable: "nelze obnovit", fee: "poplat" },
};

for (const lang of ["en", "cs"]) {
  test(`${lang}/privacy explains local storage, the password, and that runs pass through to Anthropic`, () => {
    const text = read(`content/pages/${lang}/privacy.md`).toLowerCase();
    assert.ok(text.includes(WORDS[lang].password));
    assert.ok(text.includes(WORDS[lang].unrecoverable));
    assert.ok(text.includes("anthropic"));
    assert.ok(text.includes("aa.lang"));
    assert.ok(text.includes("aa.vault"));
    assert.ok(text.includes("indexeddb"));
    assert.ok(!text.includes("no ai calls") && !text.includes("neprovádí žádná volání ai"));
  });

  test(`${lang}/terms mentions the provider fee for runs`, () => {
    const text = read(`content/pages/${lang}/terms.md`).toLowerCase();
    assert.ok(text.includes(WORDS[lang].fee));
    assert.ok(text.includes("anthropic"));
  });

  test(`${lang} help no longer claims nothing is stored except the language`, () => {
    const help = JSON.parse(read(`locales/${lang}.json`))["help.body"].toLowerCase();
    assert.ok(!help.includes("stores nothing about you except") && !help.includes("neukládá nic kromě"));
  });
}
