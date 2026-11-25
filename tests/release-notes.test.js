import test from "node:test";
import assert from "node:assert/strict";
import { parseLog, parseSelection, notesText, LIST_MAX } from "../scripts/release-notes.js";

const log = ["a1b2c3d v1.19.1-dev.2: Fix the export", "a1b2c3e v1.19.1-dev.1: Fix the export", "a1b2c3f v1.19.1-dev.0: Data tab: overview and export", "a1b2c3a v1.19.1", "a1b2c3b Plain subject without a version"].join("\n");

test("the log becomes a list of subjects without the version prefix, with the same subject once and version-only commits left out", () => {
  const items = parseLog(log);
  assert.deepEqual(items.map((i) => i.subject), ["Fix the export", "Data tab: overview and export", "Plain subject without a version"]);
  assert.equal(items[0].sha, "a1b2c3d");
});

test("the list is cut to the most recent ones and a bad line is ignored", () => {
  const many = Array.from({ length: 40 }, (_, i) => `abcdef${i} v1.0.0-dev.${i}: Change ${i}`).join("\n");
  assert.equal(parseLog(many).length, LIST_MAX);
  assert.equal(parseLog(many)[0].subject, "Change 0");
  assert.deepEqual(parseLog("not a log line\n\n"), []);
  assert.deepEqual(parseLog(undefined), []);
});

test("a choice is numbers, a range or all, and anything else is asked again", () => {
  assert.deepEqual(parseSelection("1 3 5", 5), [1, 3, 5]);
  assert.deepEqual(parseSelection("5, 1,3", 5), [1, 3, 5]);
  assert.deepEqual(parseSelection("2-4", 5), [2, 3, 4]);
  assert.deepEqual(parseSelection("a", 3), [1, 2, 3]);
  assert.deepEqual(parseSelection("all", 2), [1, 2]);
  assert.deepEqual(parseSelection("", 3), []);
  assert.deepEqual(parseSelection("2 2 3", 3), [2, 3], "a repeated number counts once");
  assert.equal(parseSelection("2 9", 3), null, "a number outside the list is asked again");
  assert.equal(parseSelection("x", 3), null);
  assert.equal(parseSelection("1 two", 3), null);
});

test("the notes are a bullet list of the chosen subjects", () => {
  const items = parseLog(log);
  assert.equal(notesText(items, [1, 3]), "- Fix the export\n- Plain subject without a version\n");
});
