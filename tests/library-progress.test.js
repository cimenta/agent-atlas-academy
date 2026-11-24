import { test } from "node:test";
import assert from "node:assert/strict";
import { loadProgress, setDone, isDone, pruneProgress } from "../public/js/library-progress.js";

const fake = (initial = null) => {
  const data = new Map(initial === null ? [] : [["aa.path.done", initial]]);
  return { getItem: (k) => (data.has(k) ? data.get(k) : null), setItem: (k, v) => data.set(k, v), data };
};

test("progress round-trips through the storage", () => {
  const storage = fake();
  assert.equal(loadProgress(storage).size, 0);
  const set = setDone(storage, "patterns", "a", true);
  assert.ok(isDone(set, "patterns", "a"));
  assert.ok(loadProgress(storage).has("patterns:a"));
  setDone(storage, "patterns", "a", false);
  assert.equal(loadProgress(storage).size, 0);
});

test("a storage that throws leaves the path working without memory", () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("full"); } };
  assert.equal(loadProgress(broken).size, 0);
  assert.ok(setDone(broken, "save", "x", true).has("save:x"));
});

test("corrupt data is an empty progress", () => {
  assert.equal(loadProgress(fake("not json")).size, 0);
  assert.equal(loadProgress(fake('{"a":1}')).size, 0);
  assert.equal(loadProgress(null).size, 0);
});

test("progress of a run that is no longer in the index is dropped", () => {
  const set = new Set(["patterns:a", "patterns:gone"]);
  assert.deepEqual([...pruneProgress(set, [{ id: "a" }])], ["patterns:a"]);
});
