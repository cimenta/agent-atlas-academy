const SLUG = /^[a-z0-9-]+$/;
const LEGAL_PAGES = new Set(["privacy", "terms", "imprint"]);
const NOT_FOUND = { name: "notfound", params: {} };
const PLAY_REPLAY = { name: "play", params: { view: "replay" } };
const HOME = { name: "home", params: {} };

// A missing or non-string hash means "no route chosen yet", which opens the home page.
export function parseRoute(hash) {
  if (typeof hash !== "string" || hash === "" || hash === "#" || hash === "#/") return HOME;
  // The Harness lab may be opened with a run and limits: #/learn/lab?run=<id>&steps=5&tokens=20000&repeat=3
  const lab = /^#\/learn\/lab(?:\?(.*))?$/.exec(hash);
  if (lab) return { name: "lab", params: labParams(lab[1]) };
  // Comparing runs: #/play/compare?runs=<id>,<id>,... (two to four runs, the first is the base)
  const compare = /^#\/play\/compare(?:\?(.*))?$/.exec(hash);
  if (compare) return { name: "play", params: { view: "compare", ids: compareIds(compare[1]) } };
  const match = /^#\/([^/]+)(?:\/([^/]+))?(?:\/([^/]+))?$/.exec(hash);
  if (!match) return NOT_FOUND;
  const [, first, second, third] = match;

  if (first === "play") return parsePlay(second, third);

  if (first === "settings" && second === "key" && third !== undefined && SLUG.test(third)) return { name: "settings", params: { slot: third } };
  if (third !== undefined) return NOT_FOUND;
  if (first === "settings" && second === "shortcuts") return { name: "settings", params: { tab: "shortcuts" } };
  if (second === undefined) {
    if (["help", "about", "learn", "settings"].includes(first)) return { name: first, params: {} };
    return NOT_FOUND;
  }
  if (first === "learn" && second === "lab") return { name: "lab", params: {} };
  if (first === "help" && SLUG.test(second)) return { name: "help", params: { topic: second } };
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

// The run and the limits a link to the Harness lab carries; anything else in the query is ignored.
function labParams(query) {
  const params = {};
  if (!query) return params;
  const q = new URLSearchParams(query);
  const run = q.get("run");
  if (run && /^[A-Za-z0-9_-]{1,80}$/.test(run)) params.run = run;
  for (const key of ["steps", "tokens", "repeat"]) {
    const n = Number(q.get(key));
    if (q.get(key) !== null && Number.isInteger(n) && n >= 0) params[key] = n;
  }
  return params;
}

// The run ids of a comparison link: valid ids only, each once, at most four.
function compareIds(query) {
  if (!query) return [];
  const raw = new URLSearchParams(query).get("runs") ?? "";
  const ids = [];
  for (const id of raw.split(",")) if (/^[A-Za-z0-9_-]{1,80}$/.test(id) && !ids.includes(id)) ids.push(id);
  return ids.slice(0, 4);
}
