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

// A run counts as done when it is marked in every goal it belongs to (the player marks all of them at once).
export const isRunDone = (set, item) => {
  const goals = Object.keys(item?.paths ?? {});
  return goals.length > 0 && goals.every((g) => set.has(`${g}:${item.id}`));
};

// The "Not done only" switch of the Library: a run marked done in any of its goals is left out.
export const withoutDone = (items, set) => items.filter((item) => !Object.keys(item.paths ?? {}).some((g) => set.has(`${g}:${item.id}`)));

// What the player menu needs for "Mark as done": the state of one run and a way to change it, for all its goals.
export function doneMarkFor(storage, item) {
  const goals = Object.keys(item?.paths ?? {});
  if (goals.length === 0) return null;
  return { isDone: () => isRunDone(loadProgress(storage()), item), toggle: (on) => goals.forEach((g) => setDone(storage(), g, item.id, on)) };
}

// For an export: the keys of the done steps, and the way back. A merge adds the keys that are not there; a replace takes the list as it is.
export const exportProgress = (storage) => [...loadProgress(storage)].sort();
export function importProgress(storage, list, mode) {
  const next = new Set(Array.isArray(list) ? list.filter((x) => typeof x === "string" && x.length <= 200) : []);
  const set = mode === "replace" ? next : new Set([...loadProgress(storage), ...next]);
  try {
    storage?.setItem(KEY, JSON.stringify([...set]));
  } catch {
    // the marks last until the page is closed
  }
  return set.size;
}
export function clearProgress(storage) {
  try {
    storage?.removeItem(KEY);
  } catch {
    // nothing more can be done
  }
}
