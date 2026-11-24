import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const load = (name) => JSON.parse(readFileSync(new URL(`../public/locales/${name}.json`, import.meta.url), "utf8"));
const en = load("en");
const cs = load("cs");
const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

const keys = [
  "tab", "tags", "detail", "tabs", "title", "hint", "legend", "step", "stepDone", "stepTip", "open", "done", "undo", "continue", "continueTitle", "allDone",
  "emptyFilter", "empty", "progress", "summary", "summaryFiltered", "filterTags", "clearTags", "removeTag", "onlyGoal", "onlyGoalNote",
  "kind.pair", "kind.bad", "kindTip.pair", "kindTip.bad", "outcome.ok", "outcome.warn", "outcome.fail", "level.label", "detailHint", "cloudHint", "cloudResult",
  ...["patterns", "save", "reliable", "wrong"].flatMap((g) => [`goal.${g}`, `goalSub.${g}`]),
  "level.1", "level.2", "level.3",
].map((k) => `path.${k}`).concat(["home.start.title", "home.start.empty", "home.start.next", "home.start.done", "home.start.button", "home.start.continue", "home.start.more"]);

test("every text of the path exists in English and Czech, and Czech differs from English", () => {
  for (const key of keys) {
    assert.equal(typeof en[key], "string", `en ${key}`);
    assert.equal(typeof cs[key], "string", `cs ${key}`);
    if (!["path.detail", "path.level.3"].includes(key)) assert.notEqual(en[key], cs[key], key);
  }
});

test("the placeholders of a text are the same in both languages", () => {
  const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const key of keys) assert.equal(holes(en[key]), holes(cs[key]), key);
});

test("the stylesheet has the classes of the path, the step and level icons and the tints", () => {
  for (const selector of [".run-row.out-ok", ".run-row.out-warn", ".run-row.out-fail", ".step-icon.done", ".lv-dots.l3", ".fbar", ".path-step.done .open", ".home-start", ".visually-hidden"]) {
    assert.ok(css.includes(selector), selector);
  }
});
