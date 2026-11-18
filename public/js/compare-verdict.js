// The student's own verdict on a comparison: which result is better, or that they cannot tell, with a short note.
// Kept in the browser (localStorage) apart from the runs, because the runs of the library are read-only files.
const KEY = "aa.compareVerdicts";
const NOTE_MAX = 200;
const ENTRIES_MAX = 50;

export const verdictKey = (ids) => [...ids].map(String).sort().join(",");

const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function createVerdictStore(storage) {
  // Every access is guarded: a storage that is missing, blocked or full behaves as an empty one.
  const read = () => {
    try {
      const parsed = JSON.parse(storage.getItem(KEY));
      return isObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  };
  const write = (all) => {
    try {
      storage.setItem(KEY, JSON.stringify(all));
      return true;
    } catch {
      return false;
    }
  };
  return {
    get(ids) {
      const entry = read()[verdictKey(ids)];
      if (!isObject(entry) || typeof entry.pick !== "string") return null;
      return { pick: entry.pick, note: typeof entry.note === "string" ? entry.note : "" };
    },
    set(ids, { pick, note = "" }) {
      if (pick !== "" && pick !== "none" && !ids.map(String).includes(pick)) return false;
      const all = read();
      const key = verdictKey(ids);
      delete all[key]; // a changed verdict becomes the newest
      all[key] = { pick, note: String(note ?? "").slice(0, NOTE_MAX) };
      const keys = Object.keys(all);
      for (const old of keys.slice(0, Math.max(0, keys.length - ENTRIES_MAX))) delete all[old];
      return write(all);
    },
    clear(ids) {
      const all = read();
      delete all[verdictKey(ids)];
      write(all);
    },
  };
}
