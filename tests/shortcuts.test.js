import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_GO_KEYS, DESTINATIONS, SHORTCUT_GROUPS, clearActivePlayer, createKeyHandler, setActivePlayer, validateGoKeys } from "../public/js/shortcuts.js";
import { parseRoute } from "../public/js/router.js";
import { createSettingsStore } from "../public/js/storage/settings.js";

const key = (k, extra = {}) => ({ key: k, target: { tagName: "BODY" }, ...extra });

function setup({ enabled = true, live = false, confirm = true, popup = false, goKeys = DEFAULT_GO_KEYS } = {}) {
  const log = [];
  let clock = 0;
  const api = Object.fromEntries(["toggle", "prev", "next", "restart", "end", "slower", "faster", "stop"].map((n) => [n, () => log.push(n)]));
  api.tab = (name) => log.push(`tab:${name}`);
  api.isLive = () => live;
  setActivePlayer(api);
  const handle = createKeyHandler({
    isEnabled: () => enabled,
    go: (hash) => log.push(`go:${hash}`),
    showHelp: () => log.push("help"),
    goKeys: () => goKeys,
    focusSearch: () => {
      log.push("search");
      return true;
    },
    confirmStop: () => {
      log.push("ask");
      return confirm;
    },
    hasPopup: () => popup,
    now: () => clock,
  });
  return { handle, log, tick: (ms) => (clock += ms), api };
}

test("g then a letter goes to a page, and only within a moment", () => {
  const { handle, log, tick } = setup();
  assert.equal(handle(key("g")), true);
  assert.equal(handle(key("c")), true);
  assert.deepEqual(log, [`go:${DESTINATIONS.create}`]);
  handle(key("g"));
  tick(5000);
  assert.equal(handle(key("p")), false);
  assert.deepEqual(log, [`go:${DESTINATIONS.create}`]);
});

test("the player keys call the player, including the arrow up and down for restart and end", () => {
  const { handle, log } = setup();
  for (const k of [" ", "ArrowLeft", "ArrowRight", "Home", "ArrowUp", "End", "ArrowDown", "[", "]", "1", "2", "3"]) assert.equal(handle(key(k)), true, k);
  assert.deepEqual(log, ["toggle", "prev", "next", "restart", "restart", "end", "end", "slower", "faster", "tab:steps", "tab:messages", "tab:output"]);
});

test("nothing happens while typing, with Ctrl held, or when shortcuts are off", () => {
  const typing = setup();
  assert.equal(typing.handle(key(" ", { target: { tagName: "INPUT" } })), false);
  assert.equal(typing.handle(key("g", { target: { tagName: "TEXTAREA" } })), false);
  assert.equal(typing.handle(key("f", { ctrlKey: true })), false);
  assert.deepEqual(typing.log, []);
  assert.equal(setup({ enabled: false }).handle(key(" ")), false);
});

test("Space on a focused button is left to the button", () => {
  const { handle, log } = setup();
  assert.equal(handle(key(" ", { target: { tagName: "BUTTON" } })), false);
  assert.deepEqual(log, []);
});

test("? asks for the shortcuts popup and / focuses the search", () => {
  const { handle, log } = setup();
  handle(key("?"));
  handle(key("/"));
  assert.deepEqual(log, ["help", "search"]);
});

test("Escape asks before stopping a live run, and does nothing for a finished run or an open pop-up", () => {
  const asked = setup({ live: true });
  assert.equal(asked.handle(key("Escape")), true);
  assert.deepEqual(asked.log, ["ask", "stop"]);
  const declined = setup({ live: true, confirm: false });
  declined.handle(key("Escape"));
  assert.deepEqual(declined.log, ["ask"]);
  const notLive = setup({ live: false });
  assert.equal(notLive.handle(key("Escape")), false);
  const popup = setup({ live: true, popup: true });
  assert.equal(popup.handle(key("Escape")), false);
  clearActivePlayer(popup.api);
});

test("without a player on screen the player keys are not used", () => {
  const { handle, api } = setup();
  clearActivePlayer(api);
  assert.equal(handle(key(" ")), false);
});

test("the shortcuts list has a label for every item, and the route and setting exist", () => {
  for (const group of SHORTCUT_GROUPS) for (const item of group.items) assert.ok(item.label && item.combos.length > 0);
  assert.deepEqual(parseRoute("#/settings/shortcuts"), { name: "settings", params: { tab: "shortcuts" } });
  const data = new Map();
  const settings = createSettingsStore({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) });
  assert.equal(settings.get().shortcuts, true);
  settings.setShortcuts(false);
  assert.equal(settings.get().shortcuts, false);
});

test("the letters after g can be changed, and invalid or repeated letters are refused", () => {
  const custom = { ...DEFAULT_GO_KEYS, play: "x", create: "y" };
  const { handle, log } = setup({ goKeys: custom });
  handle(key("g"));
  handle(key("x"));
  handle(key("g"));
  handle(key("p"));
  assert.deepEqual(log, [`go:${DESTINATIONS.play}`]);
  assert.equal(validateGoKeys({ ...DEFAULT_GO_KEYS, play: "c" }).reason, "duplicate");
  assert.equal(validateGoKeys({ ...DEFAULT_GO_KEYS, play: "ab" }).reason, "format");
  assert.equal(validateGoKeys({ ...DEFAULT_GO_KEYS, play: "?" }).reason, "format");
  assert.equal(validateGoKeys({ ...DEFAULT_GO_KEYS, play: "X" }).keys.play, "x");
  const data = new Map();
  const settings = createSettingsStore({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) });
  assert.deepEqual(settings.get().goKeys, DEFAULT_GO_KEYS);
  assert.equal(settings.setGoKeys({ ...DEFAULT_GO_KEYS, play: "x" }), true);
  assert.equal(settings.get().goKeys.play, "x");
  assert.equal(settings.setGoKeys({ ...DEFAULT_GO_KEYS, play: "c" }), false);
  assert.equal(settings.get().goKeys.play, "x");
});

test("inside the library list the arrow keys are not player keys, but other keys still are", () => {
  const { handle, log } = setup();
  const inPane = { tagName: "A", closest: (sel) => (sel === '[data-ui="library-pane"]' ? {} : null) };
  assert.equal(handle(key("ArrowDown", { target: inPane })), false);
  assert.equal(handle(key("ArrowUp", { target: inPane })), false);
  assert.deepEqual(log, []);
  assert.equal(handle(key("]", { target: inPane })), true);
});

import { pickNeighbour } from "../public/js/replay/spatial.js";

test("with nothing focused, Tab puts the focus on the player", () => {
  const { handle, api } = setup();
  let focused = 0;
  api.focusPlayer = () => (focused += 1);
  assert.equal(handle(key("Tab")), true);
  assert.equal(focused, 1);
  assert.equal(handle(key("Tab", { target: { tagName: "BUTTON" } })), false);
  assert.equal(handle(key("Tab", { shiftKey: true })), false);
});

test("moving between agents picks the nearest box in the chosen direction", () => {
  // a supervisor on top, two workers below it, side by side
  const centers = [{ x: 100, y: 0 }, { x: 40, y: 100 }, { x: 160, y: 100 }];
  assert.equal(pickNeighbour(centers, 0, "down"), 1);
  assert.equal(pickNeighbour(centers, 1, "right"), 2);
  assert.equal(pickNeighbour(centers, 2, "left"), 1);
  assert.equal(pickNeighbour(centers, 2, "up"), 0);
  assert.equal(pickNeighbour(centers, 0, "up"), -1);
  assert.equal(pickNeighbour(centers, 1, "left"), -1);
});

import { clearPageActions, setPageActions } from "../public/js/shortcuts.js";

test("b, i and o use the actions of the Play page, and do nothing elsewhere", () => {
  const { handle } = setup();
  const log = [];
  const actions = { toggleLibrary: () => log.push("toggle"), importFile: () => log.push("import"), loadLast: () => log.push("last") };
  setPageActions(actions);
  assert.equal(handle(key("b")), true);
  assert.equal(handle(key("i")), true);
  assert.equal(handle(key("o")), true);
  assert.deepEqual(log, ["toggle", "import", "last"]);
  clearPageActions(actions);
  assert.equal(handle(key("b")), false);
});

import { focusActiveLastZone, focusLibrary } from "../public/js/shortcuts.js";

test("the library joins the Tab loop when it is on screen", () => {
  assert.equal(focusLibrary(), false);
  const calls = [];
  const actions = { focusLibrary: () => (calls.push("lib"), true) };
  setPageActions(actions);
  assert.equal(focusLibrary(), true);
  clearPageActions(actions);
  const { api } = setup();
  assert.equal(focusActiveLastZone(), false);
  api.focusLast = () => calls.push("last");
  assert.equal(focusActiveLastZone(), true);
  assert.deepEqual(calls, ["lib", "last"]);
});
