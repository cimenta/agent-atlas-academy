const SLUG = /^[a-z0-9-]+$/;
const LEGAL_PAGES = new Set(["privacy", "terms", "imprint"]);
const NOT_FOUND = { name: "notfound", params: {} };

// A missing or non-string hash means "no route chosen yet", which opens the replay.
export function parseRoute(hash) {
  if (typeof hash !== "string" || hash === "" || hash === "#" || hash === "#/") {
    return { name: "play", params: {} };
  }
  const match = /^#\/([^/]+)(?:\/([^/]+))?$/.exec(hash);
  if (!match) return NOT_FOUND;
  const [, first, second] = match;
  if (second === undefined) {
    if (["play", "help", "about", "learn"].includes(first)) return { name: first, params: {} };
    return NOT_FOUND;
  }
  if (first === "learn" && SLUG.test(second)) return { name: "article", params: { slug: second } };
  if (first === "page" && LEGAL_PAGES.has(second)) return { name: "page", params: { name: second } };
  return NOT_FOUND;
}
