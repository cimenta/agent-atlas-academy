// Keyboard shortcuts: go to a page with g then a letter, and drive the player with single keys.
// Nothing here fires while the visitor types in a field or holds Ctrl, Alt or Cmd, so browser shortcuts stay theirs.

export const SHORTCUTS_HASH = "#/settings/shortcuts";
export const GO = { p: "#/play", c: "#/play/create", r: "#/play/result", l: "#/learn", h: "#/help", a: "#/about", s: "#/settings", 0: "#/" };
const SEQUENCE_MS = 1500;

// The list shown on the Shortcuts tab: the label key and the key combinations. A sequence is typed one key after the other.
export const SHORTCUT_GROUPS = [
  {
    title: "shortcuts.groupGo",
    items: [
      { label: "shortcuts.goPlay", combos: [["g", "p"]], sequence: true },
      { label: "shortcuts.goCreate", combos: [["g", "c"]], sequence: true },
      { label: "shortcuts.goResult", combos: [["g", "r"]], sequence: true },
      { label: "shortcuts.goLearn", combos: [["g", "l"]], sequence: true },
      { label: "shortcuts.goHelp", combos: [["g", "h"]], sequence: true },
      { label: "shortcuts.goAbout", combos: [["g", "a"]], sequence: true },
      { label: "shortcuts.goSettings", combos: [["g", "s"]], sequence: true },
      { label: "shortcuts.goHome", combos: [["g", "0"]], sequence: true },
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
export function createKeyHandler({ isEnabled, go, focusSearch, confirmStop, hasPopup = () => false, now = () => Date.now() }) {
  let pendingAt = null;
  return function handle(event) {
    if (!isEnabled()) return false;
    if (event.ctrlKey || event.metaKey || event.altKey) return false;
    if (isTypingTarget(event.target)) return false;
    const key = event.key;

    // g was pressed a moment ago: this key chooses the page.
    if (pendingAt !== null) {
      const fresh = now() - pendingAt < SEQUENCE_MS;
      pendingAt = null;
      const destination = fresh && key.length === 1 ? GO[key.toLowerCase()] : undefined;
      if (destination) {
        go(destination);
        return true;
      }
    }
    if (key === "g") {
      pendingAt = now();
      return true;
    }
    if (key === "?") {
      go(SHORTCUTS_HASH);
      return true;
    }
    if (key === "/") return focusSearch() === true;
    if (!active) return false;

    switch (key) {
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
