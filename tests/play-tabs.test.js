import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAY_TABS } from "../public/js/play-pages.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));

test("Play has four tabs in this order: Library, Re-play, Create, Result", () => {
  assert.deepEqual(PLAY_TABS.map((t) => t.view), ["library", "replay", "create", "result"]);
  for (const tab of PLAY_TABS) assert.equal(typeof en[tab.key], "string", tab.key);
});

test("the pane toggle of the old side panel is gone from the tab bar", () => {
  const source = read("../public/js/play-pages.js");
  assert.doesNotMatch(source, /library-toggle/);
  assert.doesNotMatch(source, /aa\.libraryOpen/);
});

test("the new Library texts exist in both languages and differ", () => {
  for (const key of ["play.tab.library", "play.noRunLoaded", "play.backToLibrary", "play.pickInLibrary"]) {
    assert.equal(typeof en[key], "string", key);
    assert.equal(typeof cs[key], "string", key);
    assert.notEqual(en[key], cs[key], key);
  }
});
