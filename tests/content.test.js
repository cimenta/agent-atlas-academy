import { test } from "node:test";
import assert from "node:assert/strict";
import { loadArticleIndex, loadArticle, loadPage } from "../public/js/content.js";

function fakeFetch(files) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    if (!(url in files)) return { ok: false, status: 404 };
    const value = files[url];
    return {
      ok: true,
      json: async () => JSON.parse(value),
      text: async () => value,
    };
  };
  fn.calls = calls;
  return fn;
}

const enIndex = JSON.stringify([
  { slug: "tools", title: "Tools", section: "tools-and-output", order: 16, summary: "s", related: [] },
  { slug: "what-is-an-agent", title: "What is an agent?", section: "basics", order: 1, summary: "s", related: [] },
]);
const csIndex = JSON.stringify([
  { slug: "what-is-an-agent", title: "Co je agent?", section: "basics", order: 1, summary: "s", related: [] },
]);
const article = "---\ntitle: Tools\nsection: tools-and-output\norder: 16\nsummary: s\nrelated: [a]\n---\nHello **you**.";

test("a Czech index fills missing articles from English and lists them", async () => {
  const f = fakeFetch({
    "/content/articles/en/index.json": enIndex,
    "/content/articles/cs/index.json": csIndex,
  });
  const { items, fallbackSlugs } = await loadArticleIndex("cs", f);
  assert.deepEqual(
    items.map((i) => i.slug),
    ["what-is-an-agent", "tools"],
  );
  assert.equal(items[0].title, "Co je agent?");
  assert.equal(items[1].title, "Tools");
  assert.deepEqual([...fallbackSlugs], ["tools"]);
});

test("the English index has no fallbacks", async () => {
  const f = fakeFetch({ "/content/articles/en/index.json": enIndex });
  const { items, fallbackSlugs } = await loadArticleIndex("en", f);
  assert.equal(items.length, 2);
  assert.equal(fallbackSlugs.size, 0);
});

test("failed index requests give an empty list, not an exception", async () => {
  const f = async () => {
    throw new Error("network");
  };
  const { items, fallbackSlugs } = await loadArticleIndex("cs", f);
  assert.deepEqual(items, []);
  assert.equal(fallbackSlugs.size, 0);
});

test("loadArticle falls back to English and says so", async () => {
  const f = fakeFetch({ "/content/articles/en/tools.md": article });
  const result = await loadArticle("cs", "tools", f);
  assert.equal(result.isFallback, true);
  assert.equal(result.meta.title, "Tools");
  assert.equal(result.blocks[0].type, "paragraph");
});

test("loadArticle uses the requested language when it exists", async () => {
  const f = fakeFetch({
    "/content/articles/cs/tools.md": article.replace("Tools", "Nástroje"),
    "/content/articles/en/tools.md": article,
  });
  const result = await loadArticle("cs", "tools", f);
  assert.equal(result.isFallback, false);
  assert.equal(result.meta.title, "Nástroje");
});

test("unknown slug, failed fetch and odd slugs return null", async () => {
  const f = fakeFetch({});
  assert.equal(await loadArticle("en", "nope", f), null);
  const rejecting = async () => {
    throw new Error("network");
  };
  assert.equal(await loadArticle("en", "tools", rejecting), null);
  const guarded = fakeFetch({});
  assert.equal(await loadArticle("en", "../secret", guarded), null);
  assert.equal(await loadArticle("..", "tools", guarded), null);
  assert.deepEqual(guarded.calls, []);
});

test("loadPage reads from the pages folder with the same fallback", async () => {
  const f = fakeFetch({ "/content/pages/en/privacy.md": "---\ntitle: Privacy\n---\nText." });
  const result = await loadPage("cs", "privacy", f);
  assert.equal(result.isFallback, true);
  assert.equal(result.meta.title, "Privacy");
});
