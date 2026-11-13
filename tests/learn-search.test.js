import test from "node:test";
import assert from "node:assert/strict";
import { blocksToText, searchArticles, snippetAround } from "../public/js/learn-search.js";

const items = [
  { slug: "tools", title: "Tools", summary: "How an agent does things." },
  { slug: "memory", title: "Memory: none", summary: "Each call starts fresh." },
  { slug: "keys", title: "API keys and secrets", summary: "A key is a password." },
];
const texts = { tools: "A tool can read a file or search the web.", memory: "Nothing is remembered between calls.", keys: "Never paste a key into a chat." };

test("blocksToText joins headings, paragraphs, lists and code", () => {
  const blocks = [
    { type: "heading", level: 2, inlines: [{ type: "text", text: "Title" }] },
    { type: "paragraph", inlines: [{ type: "text", text: "One " }, { type: "strong", text: "two" }] },
    { type: "list", ordered: false, items: [[{ type: "text", text: "a" }], [{ type: "text", text: "b" }]] },
    { type: "code", text: "x = 1" },
  ];
  assert.equal(blocksToText(blocks), "Title One two a b x = 1");
});

test("the title ranks before the summary and the summary before the text", () => {
  const found = searchArticles(items, texts, "key").map((r) => r.item.slug);
  assert.deepEqual(found, ["keys"]);
  const second = searchArticles(items, texts, "file").map((r) => r.item.slug);
  assert.deepEqual(second, ["tools"]);
  const both = searchArticles(items, { ...texts, memory: "tools are used" }, "tools").map((r) => r.item.slug);
  assert.deepEqual(both, ["tools", "memory"]);
});

test("a match in the article text brings a snippet, a match in the title does not", () => {
  const [byBody] = searchArticles(items, texts, "web");
  assert.match(byBody.snippet, /search the web/);
  const [byTitle] = searchArticles(items, texts, "memory");
  assert.equal(byTitle.snippet, "");
});

test("an empty or unknown query finds nothing, and missing texts do not break the search", () => {
  assert.deepEqual(searchArticles(items, texts, "  "), []);
  assert.deepEqual(searchArticles(items, texts, "zebra"), []);
  assert.equal(searchArticles(items, null, "Tools").length, 1);
});

test("snippetAround cuts a short piece with ellipses", () => {
  const text = `${"a ".repeat(60)}needle${" b".repeat(60)}`;
  const snippet = snippetAround(text, "needle", 10);
  assert.ok(snippet.startsWith("…") && snippet.endsWith("…"));
  assert.ok(snippet.includes("needle"));
  assert.equal(snippetAround("nothing", "zzz"), "");
});
