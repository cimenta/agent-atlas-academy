import { test } from "node:test";
import assert from "node:assert/strict";
import { doneMarkFor, withoutDone, isRunDone, loadProgress } from "../public/js/library-progress.js";

const memory = () => { const data = {}; return { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; } }; };
const run = { id: "r1", paths: { patterns: 2, reliability: 1 } };

test("Mark as done ticks the run in every goal it belongs to, and marking it not done clears them", () => {
  const storage = memory();
  const mark = doneMarkFor(() => storage, run);
  assert.equal(mark.isDone(), false);
  mark.toggle(true);
  assert.deepEqual([...loadProgress(storage)].sort(), ["patterns:r1", "reliability:r1"]);
  assert.equal(mark.isDone(), true);
  mark.toggle(false);
  assert.equal(loadProgress(storage).size, 0);
});

test("a run that is on no path has no Mark as done item", () => {
  assert.equal(doneMarkFor(() => memory(), { id: "x", paths: {} }), null);
  assert.equal(doneMarkFor(() => memory(), undefined), null);
});

test("Not done only leaves out a run marked in any goal, and keeps runs that are not marked", () => {
  const items = [run, { id: "r2", paths: { patterns: 3 } }, { id: "r3" }];
  const set = new Set(["reliability:r1"]);
  assert.deepEqual(withoutDone(items, set).map((r) => r.id), ["r2", "r3"]);
  assert.equal(isRunDone(set, run), false);
});

test("the player menu stays usable when storage is blocked", () => {
  const mark = doneMarkFor(() => null, run);
  assert.equal(mark.isDone(), false);
  mark.toggle(true);
});
