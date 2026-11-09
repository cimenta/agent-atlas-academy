export const SUPPORTED_LANGUAGES = ["en", "cs"];

const STORAGE_KEY = "aa.lang";
const LANGUAGE_CODE = /^[a-z]{2,3}$/;

export function resolveLocale({ stored, browserLanguages, supported = SUPPORTED_LANGUAGES } = {}) {
  if (typeof stored === "string" && supported.includes(stored)) return stored;
  if (Array.isArray(browserLanguages)) {
    for (const entry of browserLanguages) {
      if (typeof entry !== "string") continue;
      const primary = entry.toLowerCase().split(/[-_]/)[0];
      if (supported.includes(primary)) return primary;
    }
  }
  return "en";
}

export function createTranslator(dict, fallbackDict) {
  const missing = new Set();
  const own = (obj, key) => Object.hasOwn(obj, key) && typeof obj[key] === "string";
  const fill = (text, params) =>
    text.replace(/\{(\w+)\}/g, (whole, name) =>
      params && Object.hasOwn(params, name) ? String(params[name]) : whole,
    );
  return {
    missing,
    t(key, params) {
      if (own(dict, key)) return fill(dict[key], params);
      missing.add(key);
      if (own(fallbackDict, key)) return fill(fallbackDict[key], params);
      return key;
    },
  };
}

export function createLanguageStore(storage) {
  return {
    get() {
      try {
        const value = storage.getItem(STORAGE_KEY);
        return typeof value === "string" ? value : null;
      } catch {
        return null;
      }
    },
    set(lang) {
      try {
        storage.setItem(STORAGE_KEY, lang);
      } catch {
        // Storage may be blocked (private mode). The site works without it.
      }
    },
  };
}

export async function loadDictionary(lang, fetchFn) {
  if (typeof lang !== "string" || !LANGUAGE_CODE.test(lang)) return {};
  try {
    const response = await fetchFn(`/locales/${lang}.json`);
    if (!response.ok) return {};
    const data = await response.json();
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}
