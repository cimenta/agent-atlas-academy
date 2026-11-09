import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SUPPORTED_LANGUAGES,
  resolveLocale,
  createTranslator,
  createLanguageStore,
  loadDictionary,
} from "../public/js/i18n.js";

const localesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "locales");
const readLocale = (lang) => JSON.parse(readFileSync(join(localesDir, `${lang}.json`), "utf8"));

test("English and Czech are supported", () => {
  assert.deepEqual(SUPPORTED_LANGUAGES, ["en", "cs"]);
});

test("resolveLocale prefers a supported saved choice", () => {
  assert.equal(resolveLocale({ stored: "cs" }), "cs");
  assert.equal(resolveLocale({ stored: "cs", browserLanguages: ["en"] }), "cs");
});

test("resolveLocale reads the browser language list by primary subtag", () => {
  assert.equal(resolveLocale({ browserLanguages: ["cs-CZ", "en"] }), "cs");
  assert.equal(resolveLocale({ browserLanguages: ["en-GB"] }), "en");
  assert.equal(resolveLocale({ browserLanguages: ["de", "cs"] }), "cs");
  assert.equal(resolveLocale({ browserLanguages: ["CS_cz"] }), "cs");
});

test("resolveLocale falls back to English for odd input", () => {
  assert.equal(resolveLocale({ browserLanguages: ["de"] }), "en");
  assert.equal(resolveLocale({ browserLanguages: [] }), "en");
  assert.equal(resolveLocale({ browserLanguages: undefined }), "en");
  assert.equal(resolveLocale({ browserLanguages: [null, 5, {}] }), "en");
  assert.equal(resolveLocale({}), "en");
  assert.equal(resolveLocale(), "en");
});

test("resolveLocale ignores an unsupported saved choice", () => {
  assert.equal(resolveLocale({ stored: "xx", browserLanguages: ["cs"] }), "cs");
  assert.equal(resolveLocale({ stored: "xx" }), "en");
});

test("translator falls back to English and records the missing key", () => {
  const tr = createTranslator({ a: "Ahoj" }, { a: "Hello", b: "World" });
  assert.equal(tr.t("a"), "Ahoj");
  assert.equal(tr.t("b"), "World");
  assert.ok(tr.missing.has("b"));
  assert.ok(!tr.missing.has("a"));
});

test("translator fills placeholders and keeps unknown keys visible", () => {
  const tr = createTranslator({ step: "Step {n} of {total}" }, {});
  assert.equal(tr.t("step", { n: 3, total: 9 }), "Step 3 of 9");
  assert.equal(tr.t("nope"), "nope");
  assert.equal(tr.t("constructor"), "constructor");
});

test("language store never throws when storage fails", () => {
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  const store = createLanguageStore(broken);
  assert.equal(store.get(), null);
  assert.doesNotThrow(() => store.set("cs"));
  const none = createLanguageStore(undefined);
  assert.equal(none.get(), null);
  assert.doesNotThrow(() => none.set("cs"));
});

test("language store saves under the key aa.lang", () => {
  const data = {};
  const storage = {
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => {
      data[k] = v;
    },
  };
  const store = createLanguageStore(storage);
  store.set("cs");
  assert.equal(data["aa.lang"], "cs");
  assert.equal(store.get(), "cs");
});

test("loadDictionary returns an empty object on failure", async () => {
  assert.deepEqual(await loadDictionary("cs", async () => Promise.reject(new Error("net"))), {});
  assert.deepEqual(await loadDictionary("cs", async () => ({ ok: false, json: async () => ({}) })), {});
  assert.deepEqual(await loadDictionary("cs", async () => ({ ok: true, json: async () => null })), {});
});

test("loadDictionary refuses odd language codes without fetching", async () => {
  let called = false;
  const result = await loadDictionary("../secret", async () => {
    called = true;
    return { ok: true, json: async () => ({ a: "b" }) };
  });
  assert.deepEqual(result, {});
  assert.equal(called, false);
});

test("loadDictionary returns the dictionary on success", async () => {
  const result = await loadDictionary("cs", async (url) => {
    assert.equal(url, "/locales/cs.json");
    return { ok: true, json: async () => ({ a: "b" }) };
  });
  assert.deepEqual(result, { a: "b" });
});

test("every supported locale file has exactly the same keys as English", () => {
  const en = Object.keys(readLocale("en")).sort();
  for (const lang of SUPPORTED_LANGUAGES) {
    assert.deepEqual(Object.keys(readLocale(lang)).sort(), en, lang);
  }
});

test("every locale value is a non-empty string with matching placeholders", () => {
  const en = readLocale("en");
  const placeholders = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");
  for (const lang of SUPPORTED_LANGUAGES) {
    const other = readLocale(lang);
    for (const key of Object.keys(en)) {
      assert.equal(typeof en[key], "string", key);
      assert.ok(en[key].length > 0, key);
      assert.ok(typeof other[key] === "string" && other[key].length > 0, `${lang}:${key}`);
      assert.equal(placeholders(other[key]), placeholders(en[key]), `${lang}: placeholders of ${key}`);
    }
  }
});

test("locale texts contain no raw html", () => {
  for (const lang of SUPPORTED_LANGUAGES) {
    for (const [key, value] of Object.entries(readLocale(lang))) {
      assert.ok(!/<\s*\/?\s*[a-z]/i.test(value), `${lang}:${key} must not contain html`);
    }
  }
});
