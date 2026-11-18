import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsStore } from "../public/js/storage/settings.js";

const store = () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  return { storage, s: createSettingsStore(storage) };
};

test("the Create layout is the guided steps unless another one was chosen", () => {
  assert.equal(store().s.get().createLayout, "steps");
});

test("the workspace layout can be chosen and is kept", () => {
  const { storage, s } = store();
  s.setCreateLayout("workspace");
  assert.equal(s.get().createLayout, "workspace");
  assert.equal(createSettingsStore(storage).get().createLayout, "workspace");
});

test("any other Create layout value falls back to the steps", () => {
  const { s } = store();
  s.setCreateLayout("workspace");
  s.setCreateLayout("nonsense");
  assert.equal(s.get().createLayout, "steps");
});

import { readFileSync } from "node:fs";
const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const KEYS = ["settings.createHeading", "settings.createIntro", "settings.createLabel", "settings.createSteps", "settings.createWorkspace", "settings.createSaved"];

test("the texts of the Create layout setting exist in both languages and Czech is translated", () => {
  const en = JSON.parse(read("../public/locales/en.json"));
  const cs = JSON.parse(read("../public/locales/cs.json"));
  for (const k of KEYS) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
    assert.notEqual(cs[k], en[k], `cs ${k} is not translated`);
  }
});

test("Settings has the Create layout control and a backup restores the value", () => {
  assert.match(read("../public/js/settings-page.js"), /create-layout/);
  assert.match(read("../public/js/settings-page.js"), /setCreateLayout/);
  assert.match(read("../public/js/storage/backup.js"), /setCreateLayout/);
});
