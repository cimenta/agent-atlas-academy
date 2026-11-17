// Small settings kept in the browser. Never throws: a blocked or broken storage just gives the defaults.
import { clampLimits } from "../engine/patterns.js";
import { clampTimeoutSec, clampOutputTokens, clampRetries, clampRetryDelaySec, clampRepeatStop, clampHandoffChars } from "../engine/catalog.js";
import { mergeGoKeys, validateGoKeys } from "../shortcuts.js";
import { DEFAULT_PROVIDER_COLORS, isColor, mergeProviderColors } from "../provider-colors.js";

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
    const free = stored?.freeTier;
    return { freeTier: { google: free?.google === true }, limits: clampLimits(stored?.limits), tooltips: stored?.tooltips !== false, helpButtons: stored?.helpButtons !== false, playerLayout: stored?.playerLayout === "side" ? "side" : "bar", shortcuts: stored?.shortcuts !== false, goKeys: mergeGoKeys(stored?.goKeys), providerColors: mergeProviderColors(stored?.providerColors), requestTimeoutSec: clampTimeoutSec(stored?.requestTimeoutSec), maxOutputTokens: clampOutputTokens(stored?.maxOutputTokens), retries: clampRetries(stored?.retries ?? undefined), retryDelaySec: clampRetryDelaySec(stored?.retryDelaySec), repeatStop: clampRepeatStop(stored?.repeatStop), handoffChars: clampHandoffChars(stored?.handoffChars) };
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
    // Whether the key of a provider is on the provider's free tier (the visitor ticks it when the key is entered).
    setFreeTier(provider, on) {
      if (provider !== "google") return;
      save({ ...get(), freeTier: { ...get().freeTier, [provider]: on === true } });
    },
    // The color of a provider in replays (a #rrggbb value). Anything else is ignored.
    setProviderColor(provider, color) {
      if (!(provider in DEFAULT_PROVIDER_COLORS) || !isColor(color)) return;
      save({ ...get(), providerColors: { ...get().providerColors, [provider]: color.toLowerCase() } });
    },
    setRequestTimeout(seconds) {
      save({ ...get(), requestTimeoutSec: clampTimeoutSec(seconds) });
    },
    setMaxOutputTokens(tokens) {
      save({ ...get(), maxOutputTokens: clampOutputTokens(tokens) });
    },
    setRetries(tries, delaySec) {
      save({ ...get(), retries: clampRetries(tries), retryDelaySec: clampRetryDelaySec(delaySec) });
    },
    setRepeatStop(times) {
      save({ ...get(), repeatStop: clampRepeatStop(times) });
    },
    setHandoffChars(chars) {
      save({ ...get(), handoffChars: clampHandoffChars(chars) });
    },
    setTooltips(on) {
      save({ ...get(), tooltips: on !== false });
    },
    // The round ? buttons that open a section of Help: shown unless turned off.
    setHelpButtons(on) {
      save({ ...get(), helpButtons: on !== false });
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
