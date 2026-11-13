import test from "node:test";
import assert from "node:assert/strict";
import { filterTopics, splitTopics } from "../public/js/help-page.js";

const text = "intro\n\n## One\n\nFirst **text**.\n\n## Two\n\n- a key\n- b\n";

test("the help text is split into topics at its headings", () => {
  const topics = splitTopics(text);
  assert.deepEqual(topics.map((t) => t.title), ["One", "Two"]);
  assert.equal(topics[0].text, "First **text**.");
  assert.match(topics[1].text, /a key/);
});

test("filtering keeps the topics that match in the title or the text", () => {
  const topics = splitTopics(text);
  assert.equal(filterTopics(topics, "").length, 2);
  assert.deepEqual(filterTopics(topics, "KEY").map((t) => t.title), ["Two"]);
  assert.deepEqual(filterTopics(topics, "one").map((t) => t.title), ["One"]);
  assert.equal(filterTopics(topics, "zebra").length, 0);
});

test("the real help text has topics in both languages", async () => {
  const { readFile } = await import("node:fs/promises");
  for (const lang of ["en", "cs"]) {
    const dict = JSON.parse(await readFile(new URL(`../public/locales/${lang}.json`, import.meta.url), "utf8"));
    assert.ok(splitTopics(dict["help.body"]).length >= 7, lang);
  }
});
