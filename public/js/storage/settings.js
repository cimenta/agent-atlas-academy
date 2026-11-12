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
    // Tooltips are on unless the user turned them off.
    // The player controls sit in a column on the right ("side") unless the user chose a slim bar ("bar").
    return { limits: clampLimits(stored?.limits), tooltips: stored?.tooltips !== false, playerLayout: stored?.playerLayout === "bar" ? "bar" : "side" };
  }
  function save(next) {
    try {
      storage.setItem(KEY, JSON.stringify(next));
    } catch {
      // the setting just does not persist
    }
  }
  return {
    get,
    setLimits(limits) {
      save({ ...get(), limits: clampLimits(limits) });
    },
    setTooltips(on) {
      save({ ...get(), tooltips: on !== false });
    },
    setPlayerLayout(layout) {
      save({ ...get(), playerLayout: layout === "bar" ? "bar" : "side" });
    },
  };
}
