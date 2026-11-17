import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findSection } from "../public/js/help-topics.js";
import { createSettingsStore } from "../public/js/storage/settings.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));

test("every ? in Settings and Create points at a section of Help in both languages", () => {
  const files = ["../public/js/settings-page.js", "../public/js/create/create-page.js", "../public/js/replay/view.js", "../public/js/result-page.js"];
  const ids = new Set();
  for (const f of files) for (const m of read(f).matchAll(/\bhelp\("([a-z0-9-]+)"/g)) ids.add(m[1]);
  for (const tab of ["steps", "messages", "output"]) ids.add(`replay-${tab}`); // the replay tabs build their ids
  assert.ok(ids.size >= 18, `found ${ids.size} help buttons`);
  for (const id of ids) {
    for (const [lang, locale] of [["en", en], ["cs", cs]]) {
      const found = findSection(locale["help.body"], id);
      assert.ok(found, `${lang}: no section ${id}`);
      for (const rid of found.section.related) assert.ok(findSection(locale["help.body"], rid), `${lang}: ${id} relates to missing ${rid}`);
    }
  }
});

test("the help buttons are shown unless turned off, and the choice is kept", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const store = createSettingsStore(storage);
  assert.equal(store.get().helpButtons, true);
  store.setHelpButtons(false);
  assert.equal(store.get().helpButtons, false);
  assert.equal(createSettingsStore(storage).get().helpButtons, false);
  store.setHelpButtons(true);
  assert.equal(store.get().helpButtons, true);
});

test("the General tab and its texts exist in both languages", () => {
  for (const k of ["settings.tabGeneral", "settings.helpButtonsHeading", "settings.helpButtonsIntro", "settings.helpButtonsLabel", "settings.helpButtonsOff", "settings.helpButtonsOn"]) assert.ok(en[k] && cs[k], k);
});

test("a warning of a run points at the section that explains it", async () => {
  const { warningHelp, WARNING_HELP_IDS } = await import("../public/js/help-ids.js");
  assert.equal(warningHelp({ limit: "cost" }), "harness-cost");
  assert.equal(warningHelp({ limit: "agent_steps" }), "harness-steps");
  assert.equal(warningHelp({ handoff: { from: "a" } }), "harness-handoff");
  assert.equal(warningHelp({ retry: true }), "harness-retries");
  assert.equal(warningHelp({ truncated: true }), "harness-output");
  assert.equal(warningHelp({ message: "x" }), "replay-warnings");
  for (const id of WARNING_HELP_IDS) for (const [lang, locale] of [["en", en], ["cs", cs]]) assert.ok(findSection(locale["help.body"], id), `${lang}: ${id}`);
  assert.ok(en["replay.warningHelp"] && cs["replay.warningHelp"]);
});
