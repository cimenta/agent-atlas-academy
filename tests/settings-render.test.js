import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderSettings } from "../public/js/settings-page.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { SLOT_IDS } from "../public/js/engine/providers.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));

// A permissive fake DOM: any element accepts any call, so the test only proves that building the page does not throw.
const node = () => new Proxy(function () {}, {
  get: (t, k) => (k === "children" || k === "childNodes" ? [] : k === Symbol.toPrimitive ? () => "" : k === "classList" ? { add() {}, remove() {}, toggle() {}, contains: () => false } : k === "style" || k === "dataset" ? {} : t[k] ?? node()),
  set: (t, k, v) => { t[k] = v; return true; },
  apply: () => node(),
});
const doc = { createElement: () => node(), createTextNode: (text) => ({ text }), title: "" };
const main = { replaceChildren() {}, append() {} };

for (const slot of SLOT_IDS) {
  test(`the Settings page builds without throwing for the key slot ${slot}`, async () => {
    const t = (k) => String(en[k] ?? k);
    const vault = { getSessionKey: () => null, hasStoredKey: () => false, hasKey: () => false, isUnlocked: () => false };
    const vaultOf = vault;
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) };
    const settings = createSettingsStore(storage);
    await renderSettings({ doc, main, t, lang: "en", version: "x", fetchFn: async () => ({ ok: false }), vault, settings, runStore: {}, tab: "key", slot, isStale: () => false, onLeave() {} });
  });
}
