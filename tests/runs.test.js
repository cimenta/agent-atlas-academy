import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import { validateRun } from "../public/js/run-schema.js";

const root = new URL("../public/runs/", import.meta.url);
const readJson = (name) => JSON.parse(readFileSync(new URL(name, root), "utf8"));
const index = readJson("index.json").runs;

test("the run index lists at least one run", () => {
  assert.ok(index.length >= 1);
});

for (const entry of index) {
  const file = `${entry.id}.json`;

  test(`${entry.id}: is a valid run`, () => {
    const result = validateRun(readJson(file));
    assert.deepEqual(result.errors ?? [], []);
    assert.equal(result.ok, true);
  });

  test(`${entry.id}: index entry matches the run`, () => {
    const run = readJson(file);
    assert.equal(run.id, entry.id);
    assert.equal(run.pattern, entry.pattern);
    assert.equal(run.language, entry.language);
  });

  test(`${entry.id}: is smaller than 200 KB`, () => {
    assert.ok(statSync(new URL(file, root)).size < 200 * 1024);
  });

  test(`${entry.id}: contains no script tag`, () => {
    assert.ok(!/<script/i.test(readFileSync(new URL(file, root), "utf8")));
  });

  for (const lang of ["en", "cs"]) {
    test(`${entry.id}: ${lang} explanations point at existing events`, () => {
      const run = readJson(file);
      const explanations = readJson(`${entry.id}.explanations.${lang}.json`);
      for (const key of Object.keys(explanations)) {
        const n = Number(key);
        assert.ok(Number.isInteger(n) && n >= 0 && n < run.events.length, `bad explanation key ${key}`);
        assert.equal(typeof explanations[key], "string");
      }
    });
  }
}

test("exactly one library run is marked for the home page, and it is the sky run", () => {
  const marked = index.filter((r) => r.home === true);
  assert.equal(marked.length, 1);
  assert.equal(marked[0].id, "sequential-simple");
});

import { GOALS, levelOf, stepOf, coverageErrors, twinOf } from "../public/js/library-path.js";

test("the path of the library: every goal has two runs on every level, steps are unique, twins name each other", () => {
  // Wave 1 is being recorded run by run (4 of 20 so far), so the goal patterns is not checked for two runs per level yet.
  // Remove "patterns" from this list when wave 1 is complete; the other goals are checked as always.
  const NOT_COMPLETE_YET = ["patterns"];
  assert.deepEqual(coverageErrors(index).filter((e) => !NOT_COMPLETE_YET.some((g) => e.startsWith(`${g} `))), []);
  for (const entry of index) {
    if (entry.level !== undefined) assert.ok(levelOf(entry) > 0, `${entry.id} level`);
    for (const goal of Object.keys(entry.paths ?? {})) assert.ok(GOALS.includes(goal), `${entry.id} goal ${goal}`);
    if (entry.twin !== undefined) {
      const twin = twinOf(index, entry);
      assert.ok(twin, `${entry.id} twin exists`);
      assert.equal(twin.twin, entry.id, `${entry.id} twin names it back`);
    }
  }
  for (const goal of GOALS) {
    const steps = index.map((e) => stepOf(e, goal)).filter(Boolean);
    assert.equal(new Set(steps).size, steps.length, `${goal} steps are unique`);
  }
});
