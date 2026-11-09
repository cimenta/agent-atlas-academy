import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { parseFrontMatter } from "../public/js/markdown.js";

const root = new URL("../public/", import.meta.url);
const slugs = (lang) =>
  readdirSync(new URL(`content/articles/${lang}/`, root))
    .filter((name) => name.endsWith(".md"))
    .map((name) => name.slice(0, -3))
    .sort();
const article = (lang, slug) => readFileSync(new URL(`content/articles/${lang}/${slug}.md`, root), "utf8");

test("every English article has a Czech article with the same slug", () => {
  assert.deepEqual(slugs("cs"), slugs("en"));
});

for (const slug of slugs("en")) {
  test(`cs/${slug} matches the English front matter structure`, () => {
    const en = parseFrontMatter(article("en", slug)).meta;
    const cs = parseFrontMatter(article("cs", slug)).meta;
    assert.ok(cs.title && String(cs.title).trim().length > 0, "Czech title is not empty");
    assert.ok(cs.summary && String(cs.summary).trim().length > 0, "Czech summary is not empty");
    assert.equal(cs.section, en.section);
    assert.equal(String(cs.order), String(en.order));
    assert.deepEqual(cs.related, en.related);
  });
}

test("Czech strings are translated except for an allow-list", () => {
  const en = JSON.parse(readFileSync(new URL("locales/en.json", root), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("locales/cs.json", root), "utf8"));
  const allowed = new Set(["site.name", "lang.en", "lang.cs", "player.speedOption"]);
  const same = Object.keys(en).filter((key) => en[key] === cs[key] && !allowed.has(key));
  assert.deepEqual(same, []);
});

test("no Czech file contains an owner placeholder", () => {
  for (const slug of slugs("cs")) {
    assert.ok(!article("cs", slug).includes("[[OWNER"), slug);
  }
});
