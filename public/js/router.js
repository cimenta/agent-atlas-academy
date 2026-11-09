const SLUG = /^[a-z0-9-]+$/;
const LEGAL_PAGES = new Set(["privacy", "terms", "imprint"]);
const NOT_FOUND = { name: "notfound", params: {} };
const PLAY_REPLAY = { name: "play", params: { view: "replay" } };

// A missing or non-string hash means "no route chosen yet", which opens the replay.
export function parseRoute(hash) {
  if (typeof hash !== "string" || hash === "" || hash === "#" || hash === "#/") {
    return { name: "play", params: { view: "replay" } };
  }
  const match = /^#\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(hash);
  if (!match) return NOT_FOUND;
  const [, first, second, third] = match;

  if (first === "play") return parsePlay(second, third);

  if (third !== undefined) return NOT_FOUND;
  if (second === undefined) {
    if (["help", "about", "learn", "settings"].includes(first)) return { name: first, params: {} };
    return NOT_FOUND;
  }
  if (first === "learn" && SLUG.test(second)) return { name: "article", params: { slug: second } };
  if (first === "page" && LEGAL_PAGES.has(second)) return { name: "page", params: { name: second } };
  return NOT_FOUND;
}

function parsePlay(second, third) {
  if (second === undefined) return { ...PLAY_REPLAY, params: { view: "replay" } };
  if (second === "create" && third === undefined) return { name: "play", params: { view: "create" } };
  if (second === "result") {
    if (third === undefined) return { name: "play", params: { view: "result" } };
    if (SLUG.test(third)) return { name: "play", params: { view: "result", id: third } };
  }
  if (second === "run" && third !== undefined && SLUG.test(third)) return { name: "play", params: { view: "run", id: third } };
  return NOT_FOUND;
}
