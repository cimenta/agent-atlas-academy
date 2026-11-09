import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { buildArticleIndexes } from "../scripts/build.js";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const SECTIONS = [
  "basics",
  "orchestration",
  "memory",
  "tools-and-output",
  "control-and-cost",
  "security",
];

function article(title, section, order, related = []) {
  return `---\ntitle: ${title}\nsection: ${section}\norder: ${order}\nsummary: About ${title}\nrelated: [${related.join(", ")}]\n---\nBody of ${title}.\n`;
}

test("buildArticleIndexes writes an index per language folder", () => {
  const dir = mkdtempSync(join(tmpdir(), "aa-articles-"));
  mkdirSync(join(dir, "en"));
  writeFileSync(join(dir, "en", "alpha.md"), article("Alpha", "basics", 1, ["beta"]));
  writeFileSync(join(dir, "en", "beta.md"), article("Beta", "memory", 2));
  buildArticleIndexes(dir);
  const index = JSON.parse(readFileSync(join(dir, "en", "index.json"), "utf8"));
  assert.equal(index.length, 2);
  const alpha = index.find((i) => i.slug === "alpha");
  assert.deepEqual(alpha, {
    slug: "alpha",
    title: "Alpha",
    section: "basics",
    order: 1,
    summary: "About Alpha",
    related: ["beta"],
  });
  assert.equal(typeof alpha.order, "number");
});

test("an article without a title or order stops the build", () => {
  const dir = mkdtempSync(join(tmpdir(), "aa-articles-"));
  mkdirSync(join(dir, "en"));
  writeFileSync(join(dir, "en", "bad.md"), "---\nsection: basics\n---\nBody");
  assert.throws(() => buildArticleIndexes(dir), /bad\.md/);
});

test("the real English articles are complete and consistent", () => {
  const articlesDir = join(appDir, "public", "content", "articles");
  buildArticleIndexes(articlesDir);
  const index = JSON.parse(readFileSync(join(articlesDir, "en", "index.json"), "utf8"));
  assert.equal(index.length, 30);
  const slugs = new Set(index.map((i) => i.slug));
  const sectionKeys = Object.keys(JSON.parse(readFileSync(join(appDir, "public", "locales", "en.json"), "utf8")))
    .filter((k) => k.startsWith("learn.section."))
    .map((k) => k.slice("learn.section.".length));
  assert.deepEqual([...sectionKeys].sort(), [...SECTIONS].sort());
  for (const item of index) {
    assert.ok(SECTIONS.includes(item.section), `${item.slug}: unknown section ${item.section}`);
    assert.ok(item.title.length > 0, item.slug);
    for (const rel of item.related) {
      assert.ok(slugs.has(rel), `${item.slug}: related article ${rel} does not exist`);
    }
  }
});
