// The tags of the library runs: what a replay is about and what the student can learn from it. Pure helpers; the page draws the cloud.
// A run carries tag ids in its index entry (tags: ["prompt-chaining", "basics"]); the words are in the locale files as tag.<id>.

// Related tags share a colour. A tag that is in no group (a new one in an imported index) is drawn like the basics.
export const TAG_GROUPS = {
  pattern: ["prompt-chaining", "handoff", "parallel-work", "combining-answers", "supervisor", "tool-choice", "debate", "disagreement"],
  task: ["explaining", "planning", "decision-making", "risk-analysis"],
  efficiency: ["speed", "cost"],
  basics: ["basics"],
};

export function groupOfTag(tag) {
  return Object.keys(TAG_GROUPS).find((g) => TAG_GROUPS[g].includes(tag)) ?? "basics";
}

const tagsOf = (item) => (Array.isArray(item?.tags) ? item.tags.filter((x) => typeof x === "string" && x !== "") : []);

// How many of the runs carry each tag: a Map from the tag to its count.
export function tagCounts(items) {
  const counts = new Map();
  for (const item of items) for (const tag of new Set(tagsOf(item))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return counts;
}

// The runs that carry every one of the chosen tags (all of them, when none is chosen).
export function filterByTags(items, picked) {
  const chosen = [...picked];
  return chosen.length === 0 ? items : items.filter((item) => chosen.every((tag) => tagsOf(item).includes(tag)));
}

// The tags dealt into rows for the cloud: the most frequent one in the middle of the middle row, the next ones around it. An odd number of
// rows, the middle one with three tags (fewer when there are fewer tags), the others sharing the rest, the rows nearest the middle first.
// Inside a row the tags go from its centre outwards, so the biggest sits in the middle of the whole cloud.
export function cloudRows(counts) {
  const ordered = [...counts.keys()].sort((a, b) => counts.get(b) - counts.get(a) || a.localeCompare(b));
  const n = ordered.length;
  if (n === 0) return [];
  const rowCount = n < 4 ? 1 : n < 10 ? 3 : n < 20 ? 5 : 7;
  const mid = (rowCount - 1) / 2;
  const fill = [mid];
  for (let step = 1; step <= mid; step++) fill.push(mid + step, mid - step);
  const sizes = new Array(rowCount).fill(0);
  sizes[mid] = Math.min(3, n);
  const rest = n - sizes[mid];
  const others = fill.slice(1);
  others.forEach((row, k) => {
    sizes[row] = others.length === 0 ? 0 : Math.floor(rest / others.length) + (k < rest % others.length ? 1 : 0);
  });
  const rows = Array.from({ length: rowCount }, () => []);
  let at = 0;
  for (const row of fill) {
    const part = ordered.slice(at, at + sizes[row]);
    at += sizes[row];
    const left = [];
    const right = [];
    part.forEach((tag, i) => (i === 0 ? left.push(tag) : i % 2 === 1 ? right.push(tag) : left.unshift(tag)));
    rows[row] = [...left, ...right];
  }
  return rows.filter((row) => row.length > 0);
}

// Between 0 and 1: how often a tag occurs compared with the most frequent one (a square root keeps the small ones readable).
export function tagWeight(count, max) {
  return max > 0 ? Math.sqrt(count / max) : 0;
}
