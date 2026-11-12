import test from "node:test";
import assert from "node:assert/strict";
import { GO, SHORTCUT_GROUPS, SHORTCUTS_HASH, clearActivePlayer, createKeyHandler, setActivePlayer } from "../public/js/shortcuts.js";
import { parseRoute } from "../public/js/router.js";
import { createSettingsStore } from "../public/js/storage/settings.js";

const key = (k, extra = {}) => ({ key: k, target: { tagName: "BODY" }, ...extra });

function setup({ enabled = true, live = false, confirm = true, popup = false } = {}) {
  const log = [];
  let clock = 0;
  const api = Object.fromEntries(["toggle", "prev", "next", "restart", "end", "slower", "faster", "stop"].map((n) => [n, () => log.push(n)]));
  api.tab = (name) => log.push(`tab:${name}`);
  api.isLive = () => live;
  setActivePlayer(api);
  const handle = createKeyHandler({
    isEnabled: () => enabled,
    go: (hash) => log.push(`go:${hash}`),
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
  assert.deepEqual(log, [`go:${GO.c}`]);
  handle(key("g"));
  tick(5000);
  assert.equal(handle(key("p")), false);
  assert.deepEqual(log, [`go:${GO.c}`]);
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

test("? opens the shortcuts tab and / focuses the search", () => {
  const { handle, log } = setup();
  handle(key("?"));
  handle(key("/"));
  assert.deepEqual(log, [`go:${SHORTCUTS_HASH}`, "search"]);
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
