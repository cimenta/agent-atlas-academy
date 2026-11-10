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
