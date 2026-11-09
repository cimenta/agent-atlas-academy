// Small settings kept in the browser. Never throws: a blocked or broken storage just gives the defaults.
import { clampLimits } from "../engine/patterns.js";

const KEY = "aa.settings";

export function createSettingsStore(storage) {
  function get() {
    let stored = {};
    try {
      const raw = storage.getItem(KEY);
      if (raw) stored = JSON.parse(raw);
    } catch {
      stored = {};
    }
    return { limits: clampLimits(stored?.limits) };
  }
  return {
    get,
    setLimits(limits) {
      try {
        storage.setItem(KEY, JSON.stringify({ limits: clampLimits(limits) }));
      } catch {
        // the setting just does not persist
      }
    },
  };
}
