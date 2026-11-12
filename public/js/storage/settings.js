// Small settings kept in the browser. Never throws: a blocked or broken storage just gives the defaults.
import { clampLimits } from "../engine/patterns.js";
import { mergeGoKeys, validateGoKeys } from "../shortcuts.js";

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
    // The player controls sit on one slim bar ("bar") unless the user chose the side column ("side").
    return { limits: clampLimits(stored?.limits), tooltips: stored?.tooltips !== false, playerLayout: stored?.playerLayout === "side" ? "side" : "bar", shortcuts: stored?.shortcuts !== false, goKeys: mergeGoKeys(stored?.goKeys) };
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
    // Returns false (and keeps the old letters) when the new ones are not valid.
    setGoKeys(map) {
      const checked = validateGoKeys(map);
      if (checked.ok) save({ ...get(), goKeys: checked.keys });
      return checked.ok;
    },
    setShortcuts(on) {
      save({ ...get(), shortcuts: on !== false });
    },
    setPlayerLayout(layout) {
      save({ ...get(), playerLayout: layout === "side" ? "side" : "bar" });
    },
  };
}
