// The steps of the recommended path the student has marked as done. Kept in this browser only (localStorage), as a JSON list of keys
// "<goal>:<runId>". Every storage call is guarded: a blocked or full storage leaves the path working, without memory.
const KEY = "aa.path.done";

export function loadProgress(storage) {
  try {
    const list = JSON.parse(storage?.getItem(KEY) ?? "[]");
    return new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string") : []);
  } catch {
    return new Set();
  }
}

export function setDone(storage, goalId, runId, on) {
  const set = loadProgress(storage);
  const key = `${goalId}:${runId}`;
  if (on) set.add(key);
  else set.delete(key);
  try {
    storage?.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // the mark lasts until the page is closed
  }
  return set;
}

export const isDone = (set, goalId, runId) => set.has(`${goalId}:${runId}`);

export function pruneProgress(set, items) {
  const ids = new Set((Array.isArray(items) ? items : []).map((r) => r.id));
  return new Set([...set].filter((key) => ids.has(key.slice(key.indexOf(":") + 1))));
}
