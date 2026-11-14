import { h } from "./dom.js";
import { parseRoute } from "./router.js";
import { loadVersion } from "./version.js";
import { createVault } from "./storage/key-vault.js";
import { markUnlockAlert } from "./unlock-alert.js";
import { createKeyHandler } from "./shortcuts.js";
import { createShortcutsPopup } from "./shortcuts-popup.js";
import { createSettingsStore } from "./storage/settings.js";
import { migrateGeminiKey } from "./storage/gemini-slots.js";
import { createIndexedDbBackend, createMemoryBackend, createRunStore } from "./storage/runs-store.js";
import { renderSettings } from "./settings-page.js";
import { renderPlay } from "./play-pages.js";
import {
  SUPPORTED_LANGUAGES,
  createLanguageStore,
  createTranslator,
  loadDictionary,
  resolveLocale,
} from "./i18n.js";
import {
  renderArticle,
  renderLanding,
  renderLearn,
  renderLegalPage,
  renderNotFound,
  renderTextPage,
  setTitle,
} from "./pages.js";
import { renderHelp } from "./help-page.js";

const doc = document;
const fetchFn = (url) => fetch(url);

function safeStorage() {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => void map.set(k, String(v)),
    removeItem: (k) => void map.delete(k),
  };
}

const storage = safeStorage() ?? memoryStorage();
const store = createLanguageStore(safeStorage());
const vault = createVault({ storage });
const settings = createSettingsStore(storage);
migrateGeminiKey({ storage, settings });
const runStore = createRunStore(typeof indexedDB === "undefined" ? createMemoryBackend() : createIndexedDbBackend());
const menu = doc.getElementById("menu");
const menuToggle = doc.getElementById("menu-toggle");
const switcher = doc.getElementById("language-switcher");
const main = doc.getElementById("main");
const footer = doc.getElementById("footer");
const versionLabel = doc.getElementById("version");
const tagline = doc.getElementById("tagline");

// Opening the site with ?ui in the address shows the data-ui name of every labelled element.
if (new URLSearchParams(globalThis.location?.search ?? "").has("ui")) doc.body.setAttribute("data-show-ui", "");

let lang = resolveLocale({
  stored: store.get(),
  browserLanguages: navigator.languages && navigator.languages.length ? [...navigator.languages] : [navigator.language],
});
let englishDict = {};
let translator = createTranslator({}, {});
let version = "unknown";
let token = 0;
let cleanups = [];

const t = (key, params) => translator.t(key, params);

const MENU = [
  { route: "play", href: "#/play", key: "menu.play" },
  { route: "learn", href: "#/learn", key: "menu.learn" },
  { route: "help", href: "#/help", key: "menu.help" },
  { route: "about", href: "#/about", key: "menu.about" },
  { route: "settings", href: "#/settings", key: "menu.settings", icon: "⚙" },
];

function menuRouteFor(route) {
  if (route.name === "article") return "learn";
  return route.name;
}

function renderChrome(route) {
  const active = menuRouteFor(route);
  menu.setAttribute("aria-label", t("menu.label"));
  menu.replaceChildren(
    ...MENU.map((item) =>
      h(
        doc,
        "a",
        {
          href: item.href,
          class: item.icon ? "menu-icon" : undefined,
          "aria-label": item.icon ? t(item.key) : undefined,
          title: item.icon ? t(item.key) : undefined,
          "aria-current": item.route === active ? "page" : undefined,
        },
        item.icon ?? t(item.key),
      ),
    ),
  );
  markUnlockAlert(doc, vault, t);
  menuToggle.textContent = "\u2630";
  menuToggle.setAttribute("aria-label", t("menu.toggle"));

  switcher.replaceChildren(
    ...SUPPORTED_LANGUAGES.map((code) => {
      const button = h(
        doc,
        "button",
        { type: "button", lang: code, "aria-pressed": String(code === lang), "aria-label": `${t("lang.label")}: ${t(`lang.${code}`)}` },
        code.toUpperCase(),
      );
      button.addEventListener("click", () => switchLanguage(code));
      return button;
    }),
  );

  const links = h(
    doc,
    "ul",
    {},
    ...[
      ["privacy", "footer.privacy"],
      ["terms", "footer.terms"],
      ["imprint", "footer.imprint"],
    ].map(([name, key]) => h(doc, "li", {}, h(doc, "a", { href: `#/page/${name}` }, t(key)))),
  );
  footer.replaceChildren(
    links,
    h(doc, "p", {}, t("footer.license")),
  );
  versionLabel.textContent = version !== "unknown" ? `v${version}` : "";
  tagline.textContent = t("site.tagline");
  doc.querySelector(".skip-link").textContent = t("a11y.skip");
  doc.documentElement.lang = lang;
}

async function renderRoute(isNavigation) {
  for (const cleanup of cleanups) cleanup();
  cleanups = [];
  token += 1;
  const mine = token;
  const route = parseRoute(location.hash);
  renderChrome(route);
  const playSlot = doc.getElementById("play-tabs");
  if (playSlot) {
    playSlot.replaceChildren();
    playSlot.hidden = true;
  }
  menu.classList.remove("open");
  menuToggle.setAttribute("aria-expanded", "false");
  const ctx = {
    doc,
    main,
    t,
    lang,
    version,
    fetchFn,
    vault,
    settings,
    runStore,
    tab: route.params?.tab,
    slot: route.params?.slot,
    autoStart: !(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
    isStale: () => mine !== token,
    onLeave: (fn) => cleanups.push(fn),
  };
  try {
    switch (route.name) {
      case "home":
        await renderLanding(ctx);
        break;
      case "play":
        await renderPlay(ctx, route.params);
        break;
      case "settings":
        renderSettings(ctx);
        break;
      case "learn":
        await renderLearn(ctx);
        break;
      case "article":
        await renderArticle(ctx, route.params.slug);
        break;
      case "help":
        renderHelp(ctx);
        break;
      case "about":
        renderTextPage(ctx, "about.title", "about.body");
        break;
      case "page":
        await renderLegalPage(ctx, route.params.name);
        break;
      default:
        renderNotFound(ctx);
    }
  } catch {
    if (mine === token) {
      setTitle(ctx, t("error.notFound"));
      main.replaceChildren(h(doc, "p", { class: "notice", role: "alert" }, t("error.loadFailed")));
    }
  }
  if (isNavigation && mine === token) {
    window.scrollTo(0, 0);
    main.focus();
  }
}

async function switchLanguage(code) {
  lang = code;
  store.set(code);
  translator = createTranslator(code === "en" ? englishDict : await loadDictionary(code, fetchFn), englishDict);
  await renderRoute(false);
}

// The site name always leads to the home page. When the
// address is already that page, the link does not change the address, so draw the page again.
doc.querySelector(".brand")?.addEventListener("click", (event) => {
  if (location.hash === "" || location.hash === "#" || location.hash === "#/") {
    event.preventDefault();
    renderRoute(true);
  }
});

menuToggle.addEventListener("click", () => {
  const open = menu.classList.toggle("open");
  menuToggle.setAttribute("aria-expanded", String(open));
});
window.addEventListener("hashchange", () => renderRoute(true));

// Keyboard shortcuts (they can be turned off in Settings).
const shortcutsPopup = createShortcutsPopup({ doc, t, getGoKeys: () => settings.get().goKeys });
const handleKey = createKeyHandler({
  isEnabled: () => settings.get().shortcuts,
  goKeys: () => settings.get().goKeys,
  showHelp: () => shortcutsPopup.toggle(),
  go: (hash) => {
    location.hash = hash;
  },
  focusSearch: () => {
    const field = doc.querySelector('[data-ui="library-search"]');
    if (!field) return false;
    field.focus();
    return true;
  },
  confirmStop: () => window.confirm(t("shortcuts.stopConfirm")),
  hasPopup: () => Boolean(doc.querySelector(".center-tip")),
});
doc.addEventListener("keydown", (event) => {
  // While the popup is open only the question mark (which closes it) and Escape do anything.
  if (shortcutsPopup.isOpen() && event.key !== "?") return;
  if (handleKey(event)) event.preventDefault();
});

englishDict = await loadDictionary("en", fetchFn);
translator = createTranslator(lang === "en" ? englishDict : await loadDictionary(lang, fetchFn), englishDict);
version = await loadVersion(fetchFn);
await renderRoute(false);
