import { parseFrontMatter, parseMarkdown } from "./markdown.js";

export const SECTION_ORDER = [
  "basics",
  "orchestration",
  "memory",
  "tools-and-output",
  "control-and-cost",
  "security",
];

const NAME = /^[a-z0-9-]+$/;
const LANG = /^[a-z]{2,3}$/;

async function fetchJson(fetchFn, url) {
  try {
    const response = await fetchFn(url);
    if (!response.ok) return null;
    const data = await response.json();
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

async function fetchText(fetchFn, url) {
  try {
    const response = await fetchFn(url);
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
}

function sectionRank(section) {
  const rank = SECTION_ORDER.indexOf(section);
  return rank === -1 ? SECTION_ORDER.length : rank;
}

export async function loadArticleIndex(lang, fetchFn) {
  const english = (await fetchJson(fetchFn, "/content/articles/en/index.json")) || [];
  const own =
    lang !== "en" && LANG.test(lang)
      ? (await fetchJson(fetchFn, `/content/articles/${lang}/index.json`)) || []
      : [];
  const bySlug = new Map(english.map((item) => [item.slug, item]));
  const fallbackSlugs = new Set(bySlug.keys());
  if (lang === "en") fallbackSlugs.clear();
  for (const item of own) {
    bySlug.set(item.slug, item);
    fallbackSlugs.delete(item.slug);
  }
  const items = [...bySlug.values()].sort(
    (a, b) => sectionRank(a.section) - sectionRank(b.section) || a.order - b.order,
  );
  return { items, fallbackSlugs };
}

async function loadDocument(folder, lang, name, fetchFn) {
  if (!NAME.test(name) || !LANG.test(lang)) return null;
  let text = await fetchText(fetchFn, `/content/${folder}/${lang}/${name}.md`);
  let isFallback = false;
  if (text === null && lang !== "en") {
    text = await fetchText(fetchFn, `/content/${folder}/en/${name}.md`);
    isFallback = true;
  }
  if (text === null) return null;
  const { meta, body } = parseFrontMatter(text);
  return { meta, blocks: parseMarkdown(body), isFallback };
}

export function loadArticle(lang, slug, fetchFn) {
  return loadDocument("articles", lang, slug, fetchFn);
}

export function loadPage(lang, name, fetchFn) {
  return loadDocument("pages", lang, name, fetchFn);
}
