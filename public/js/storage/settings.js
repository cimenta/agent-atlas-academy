// Small settings kept in the browser. Never throws: a blocked or broken storage just gives the defaults.
import { clampLimits } from "../engine/patterns.js";
import { clampTimeoutSec, clampOutputTokens, clampRetries, clampRetryDelaySec, clampRepeatStop, clampHandoffChars, clampFallback } from "../engine/catalog.js";
import { mergeGoKeys, validateGoKeys } from "../shortcuts.js";
import { DEFAULT_PROVIDER_COLORS, isColor, mergeProviderColors } from "../provider-colors.js";
import { PROVIDER_IDS, freeSlotOf, overrideIdOk } from "../engine/providers.js";
import { cleanOverrides, OVERRIDE_SLOT, OVERRIDE_TIERS } from "../engine/free-check.js";

const KEY = "aa.settings";
// The providers that have a free tier (Gemini): the visitor says whether the key is on it.
const FREE_PROVIDERS = PROVIDER_IDS.filter((p) => freeSlotOf(p) !== null);

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
    return { freeTier: Object.fromEntries(FREE_PROVIDERS.map((p) => [p, free?.[p] === true])), limits: clampLimits(stored?.limits), tooltips: stored?.tooltips !== false, helpButtons: stored?.helpButtons !== false, webSearch: stored?.webSearch !== false, ownTools: stored?.ownTools !== false, fallback: clampFallback(stored?.fallback), formatEnforcement: stored?.formatEnforcement !== false, playerLayout: stored?.playerLayout === "side" ? "side" : "bar", createLayout: stored?.createLayout === "workspace" ? "workspace" : "steps", shortcuts: stored?.shortcuts !== false, goKeys: mergeGoKeys(stored?.goKeys), providerColors: mergeProviderColors(stored?.providerColors), requestTimeoutSec: clampTimeoutSec(stored?.requestTimeoutSec), maxOutputTokens: clampOutputTokens(stored?.maxOutputTokens), retries: clampRetries(stored?.retries ?? undefined), retryDelaySec: clampRetryDelaySec(stored?.retryDelaySec), repeatStop: clampRepeatStop(stored?.repeatStop), handoffChars: clampHandoffChars(stored?.handoffChars), modelOverrides: cleanOverrides(stored?.modelOverrides) };
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
      if (!FREE_PROVIDERS.includes(provider)) return;
      save({ ...get(), freeTier: { ...get().freeTier, [provider]: on === true } });
    },
    // The id a student chose for a free OpenRouter model that is gone (a tier of the free slot); null removes it. A bad id, an unknown slot or tier is ignored.
    setModelOverride(slot, key, id) {
      if (slot !== OVERRIDE_SLOT || !OVERRIDE_TIERS.includes(key)) return;
      if (id !== null && !overrideIdOk(id)) return;
      const own = { ...(get().modelOverrides[OVERRIDE_SLOT] ?? {}) };
      if (id === null) delete own[key];
      else own[key] = id;
      save({ ...get(), modelOverrides: cleanOverrides({ [OVERRIDE_SLOT]: own }) });
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
    setFallback(mode) {
      save({ ...get(), fallback: clampFallback(mode) });
    },
    // Whether the provider is asked to force the shape of a reply (Settings, Harness, Format): on unless the visitor turned it off.
    setFormatEnforcement(on) {
      save({ ...get(), formatEnforcement: on !== false });
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
    // Web search is allowed in runs unless the visitor forbade it (the master switch of Settings, Harness, Tools).
    setWebSearch(on) {
      save({ ...get(), webSearch: on !== false });
    },
    // The tools of our own (calculator, date and time, ...) are allowed in runs unless the visitor forbade them (Settings, Harness, Tools).
    setOwnTools(on) {
      save({ ...get(), ownTools: on !== false });
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
    // How the Create tab is laid out: guided steps (the default) or the workspace.
    setCreateLayout(layout) {
      save({ ...get(), createLayout: layout === "workspace" ? "workspace" : "steps" });
    },
    setPlayerLayout(layout) {
      save({ ...get(), playerLayout: layout === "side" ? "side" : "bar" });
    },
  };
}
