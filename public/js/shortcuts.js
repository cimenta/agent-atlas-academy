// Keyboard shortcuts: go to a page with g then a letter, and drive the player with single keys.
// Nothing here fires while the visitor types in a field or holds Ctrl, Alt or Cmd, so browser shortcuts stay theirs.

export const SHORTCUTS_HASH = "#/settings/shortcuts";
// Where each "go to" shortcut leads, and the letter that is its default. The visitor can change the letters.
export const DESTINATIONS = { play: "#/play", create: "#/play/create", result: "#/play/result", learn: "#/learn", help: "#/help", about: "#/about", settings: "#/settings", home: "#/" };
export const DEFAULT_GO_KEYS = { play: "p", create: "c", result: "r", learn: "l", help: "h", about: "a", settings: "s", home: "0" };

// A set of letters is valid when every destination has one, each is a single letter or digit, and no two are the same.
export function validateGoKeys(map) {
  if (!map || typeof map !== "object") return { ok: false, reason: "format" };
  const seen = new Set();
  const keys = {};
  for (const id of Object.keys(DEFAULT_GO_KEYS)) {
    const value = typeof map[id] === "string" ? map[id].toLowerCase() : "";
    if (!/^[a-z0-9]$/.test(value)) return { ok: false, reason: "format", id };
    if (seen.has(value)) return { ok: false, reason: "duplicate", id };
    seen.add(value);
    keys[id] = value;
  }
  return { ok: true, keys };
}

// What was stored, or the defaults when it is missing or not valid.
export function mergeGoKeys(stored) {
  const merged = validateGoKeys({ ...DEFAULT_GO_KEYS, ...(stored && typeof stored === "object" ? stored : {}) });
  return merged.ok ? merged.keys : { ...DEFAULT_GO_KEYS };
}
const SEQUENCE_MS = 1500;

// The list shown on the Shortcuts tab: the label key and the key combinations. A sequence is typed one key after the other.
export const SHORTCUT_GROUPS = [
  {
    title: "shortcuts.groupGo",
    items: [
      { label: "shortcuts.goPlay", go: "play", combos: [["g", "p"]], sequence: true },
      { label: "shortcuts.goCreate", go: "create", combos: [["g", "c"]], sequence: true },
      { label: "shortcuts.goResult", go: "result", combos: [["g", "r"]], sequence: true },
      { label: "shortcuts.goLearn", go: "learn", combos: [["g", "l"]], sequence: true },
      { label: "shortcuts.goHelp", go: "help", combos: [["g", "h"]], sequence: true },
      { label: "shortcuts.goAbout", go: "about", combos: [["g", "a"]], sequence: true },
      { label: "shortcuts.goSettings", go: "settings", combos: [["g", "s"]], sequence: true },
      { label: "shortcuts.goHome", go: "home", combos: [["g", "0"]], sequence: true },
    ],
  },
  {
    title: "shortcuts.groupPlayer",
    items: [
      { label: "shortcuts.playPause", combos: [["Space"]] },
      { label: "shortcuts.step", combos: [["←"], ["→"]] },
      { label: "shortcuts.restart", combos: [["Home"], ["↑"]] },
      { label: "shortcuts.end", combos: [["End"], ["↓"]] },
      { label: "shortcuts.speed", combos: [["["], ["]"]] },
      { label: "shortcuts.tabs", combos: [["1"], ["2"], ["3"]] },
      { label: "shortcuts.stopRun", combos: [["Esc"]] },
    ],
  },
  {
    title: "shortcuts.groupFocus",
    items: [
      { label: "shortcuts.focusTab", combos: [["Tab"], ["Shift+Tab"]] },
      { label: "shortcuts.focusLibrary", combos: [["q"]] },
      { label: "shortcuts.focusMove", combos: [["↑ ← ↓ →"], ["W A S D"]] },
      { label: "shortcuts.focusEnter", combos: [["Enter"]] },
    ],
  },
  {
    title: "shortcuts.groupLibrary",
    items: [
      { label: "shortcuts.libToggle", combos: [["b"]] },
      { label: "shortcuts.libImport", combos: [["i"]] },
      { label: "shortcuts.libLast", combos: [["o"]] },
      { label: "shortcuts.libMove", combos: [["↑"], ["↓"]] },
      { label: "shortcuts.libOpen", combos: [["Enter"]] },
      { label: "shortcuts.libSwitch", combos: [["←"], ["→"]] },
      { label: "shortcuts.libLeave", combos: [["Esc"]] },
    ],
  },
  {
    title: "shortcuts.groupAnywhere",
    items: [
      { label: "shortcuts.search", combos: [["/"]] },
      { label: "shortcuts.showList", combos: [["?"]] },
    ],
  },
];

// The player on screen registers what the keys can do; there is at most one at a time.
let active = null;
export function setActivePlayer(api) {
  active = api;
}
// Puts the keyboard focus on the player on screen. Returns false when there is none.
export function focusActivePlayer() {
  if (!active?.focusPlayer) return false;
  active.focusPlayer();
  return true;
}
// The Play page registers what b, i and o do there: show or hide the library, import a file, load the last opened run.
let pageActions = null;
export function setPageActions(api) {
  pageActions = api;
}
// Puts the focus in the library list of the Play page; false when there is none (or it is hidden).
export function focusLibrary() {
  return pageActions?.focusLibrary ? pageActions.focusLibrary() === true : false;
}
export function clearPageActions(api) {
  if (pageActions === api) pageActions = null;
}
// Puts the focus on the last part of the player (the Output tab).
export function focusActiveLastZone() {
  if (!active?.focusLast) return false;
  active.focusLast();
  return true;
}
export function clearActivePlayer(api) {
  if (active === api) active = null;
}

const TYPING = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const ACTIVATES_ON_SPACE = new Set(["BUTTON", "A", "SUMMARY"]);

export function isTypingTarget(el) {
  if (!el) return false;
  return TYPING.has(el.tagName) || el.isContentEditable === true;
}

// Returns handle(event): true when the key was used, so the caller can stop the browser from acting on it too.
export function createKeyHandler({ isEnabled, go, showHelp, goKeys = () => DEFAULT_GO_KEYS, focusSearch, confirmStop, hasPopup = () => false, now = () => Date.now() }) {
  let pendingAt = null;
  return function handle(event) {
    if (!isEnabled()) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (isTypingTarget(event.target)) return false;
    const key = event.key;
    // In the library list the arrows move between runs, so they are not player keys there.
    if (key.startsWith("Arrow") && event.target?.closest?.('[data-ui="library-pane"]')) return false;

    // g was pressed a moment ago: this key chooses the page.
    if (pendingAt !== null) {
      const fresh = now() - pendingAt < SEQUENCE_MS;
      pendingAt = null;
      const keys = goKeys();
      const id = fresh && key.length === 1 ? Object.keys(keys).find((name) => keys[name] === key.toLowerCase()) : undefined;
      if (id) {
        go(DESTINATIONS[id]);
        return true;
      }
    }
    if (key === "g") {
      pendingAt = now();
      return true;
    }
    if (key === "?") {
      showHelp();
      return true;
    }
    if (key === "/") return focusSearch() === true;
    // q swaps between the library and the player.
    if (key === "q") {
      const inLibrary = Boolean(event.target?.closest?.('[data-ui="library-pane"]'));
      return inLibrary ? focusActivePlayer() : focusLibrary();
    }
    const pageAction = { b: "toggleLibrary", i: "importFile", o: "loadLast" }[key];
    if (pageAction && pageActions?.[pageAction]) {
      pageActions[pageAction]();
      return true;
    }
    if (!active) return false;

    switch (key) {
      case "Tab":
        // With nothing focused, Tab goes into the player (then Tab walks its parts).
        if (event.shiftKey || (event.target && event.target.tagName !== "BODY")) return false;
        return active.focusPlayer ? (active.focusPlayer(), true) : false;
      case " ":
        if (ACTIVATES_ON_SPACE.has(event.target?.tagName) || event.target?.getAttribute?.("role") === "tab") return false;
        active.toggle();
        return true;
      case "ArrowLeft":
        active.prev();
        return true;
      case "ArrowRight":
        active.next();
        return true;
      case "Home":
      case "ArrowUp":
        active.restart();
        return true;
      case "End":
      case "ArrowDown":
        active.end();
        return true;
      case "[":
        active.slower();
        return true;
      case "]":
        active.faster();
        return true;
      case "1":
        active.tab("steps");
        return true;
      case "2":
        active.tab("messages");
        return true;
      case "3":
        active.tab("output");
        return true;
      case "Escape":
        if (!active.isLive() || hasPopup()) return false;
        if (confirmStop()) active.stop();
        return true;
      default:
        return false;
    }
  };
}
