// The rules of the recommended path of the Library. Pure helpers; the page draws.
// A run of the library carries, in runs/index.json: level (1 to 3), kind ("pair" or "bad"), twin (the id of the other run of a before and
// after pair) and paths ({ goal: step }), the step being a positive whole number inside the goal.

export const GOALS = ["patterns", "save", "reliable", "wrong"];
export const LEVELS = [1, 2, 3];

export const levelOf = (item) => (item && Number.isInteger(item.level) && item.level >= 1 && item.level <= 3 ? item.level : 0);

export function stepOf(item, goalId) {
  const paths = item?.paths;
  if (paths === null || typeof paths !== "object" || Array.isArray(paths)) return 0;
  const step = paths[goalId];
  return Number.isInteger(step) && step > 0 ? step : 0;
}

export const kindOf = (item) => (item?.kind === "pair" || item?.kind === "bad" ? item.kind : "");

const tagsOf = (item) => (Array.isArray(item?.tags) ? item.tags.filter((x) => typeof x === "string") : []);

// The runs of a goal by level, each level sorted by step. A run without a valid level or step is left out.
export function goalLevels(items, goalId, tags = []) {
  const out = { 1: [], 2: [], 3: [] };
  const list = Array.isArray(items) ? items : [];
  for (const item of list) {
    const level = levelOf(item);
    if (level === 0 || stepOf(item, goalId) === 0) continue;
    if (!tags.every((tag) => tagsOf(item).includes(tag))) continue;
    out[level].push(item);
  }
  for (const level of LEVELS) out[level].sort((a, b) => stepOf(a, goalId) - stepOf(b, goalId));
  return out;
}

// The first run of the (filtered) goal, by step, that is not done. done holds keys "<goal>:<runId>".
export function nextStep(items, goalId, done, tags = []) {
  const levels = goalLevels(items, goalId, tags);
  const all = LEVELS.flatMap((level) => levels[level]).sort((a, b) => stepOf(a, goalId) - stepOf(b, goalId));
  return all.find((item) => !done.has(`${goalId}:${item.id}`)) ?? null;
}

// A goal that has runs needs at least two on every level; one message for each level that has fewer.
export function coverageErrors(items) {
  const errors = [];
  for (const goalId of GOALS) {
    const levels = goalLevels(items, goalId);
    const total = LEVELS.reduce((n, level) => n + levels[level].length, 0);
    if (total === 0) continue;
    for (const level of LEVELS) if (levels[level].length < 2) errors.push(`${goalId} level ${level} has ${levels[level].length} runs`);
  }
  return errors;
}

export function twinOf(items, item) {
  if (typeof item?.twin !== "string" || item.twin === "") return null;
  return (Array.isArray(items) ? items : []).find((r) => r.id === item.twin) ?? null;
}
