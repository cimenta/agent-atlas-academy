// Full-text search over the Learn articles. Pure functions, so they can be tested without a page.
import { findMatches } from "./text-search.js";

const inlineText = (inlines) => (inlines ?? []).map((part) => part.text ?? "").join("");

// The plain text of a parsed article: headings, paragraphs, list items and code, joined with spaces.
export function blocksToText(blocks) {
  const parts = [];
  for (const block of blocks ?? []) {
    if (block.type === "list") for (const item of block.items) parts.push(inlineText(item));
    else if (block.type === "code") parts.push(block.text ?? "");
    else parts.push(inlineText(block.inlines));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// A short piece of the text around the first match, with ellipses where it was cut.
export function snippetAround(text, query, radius = 60) {
  const [first] = findMatches(text, query);
  if (!first) return "";
  const from = Math.max(0, first.start - radius);
  const to = Math.min(text.length, first.end + radius);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

// items: [{ slug, title, summary }], texts: { slug: plain text }. Titles first, then summaries, then the article text.
// Every result is { item, snippet }; the snippet is only set when the match is in the article text.
export function searchArticles(items, texts, query) {
  const q = String(query ?? "").trim();
  if (!q) return [];
  const ranked = [];
  for (const item of items) {
    let rank = 3;
    let snippet = "";
    if (findMatches(item.title, q).length) rank = 0;
    else if (findMatches(item.summary ?? "", q).length) rank = 1;
    else {
      const body = texts?.[item.slug] ?? "";
      if (findMatches(body, q).length) {
        rank = 2;
        snippet = snippetAround(body, q);
      }
    }
    if (rank < 3) ranked.push({ item, snippet, rank });
  }
  return ranked.sort((a, b) => a.rank - b.rank).map(({ item, snippet }) => ({ item, snippet }));
}
