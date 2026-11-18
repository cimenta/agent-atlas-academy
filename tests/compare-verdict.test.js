import { test } from "node:test";
import assert from "node:assert/strict";
import { verdictKey, createVerdictStore } from "../public/js/compare-verdict.js";

function fakeStorage(initial = {}) {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => void (data[k] = String(v)), removeItem: (k) => void delete data[k] };
}

test("set then get round-trips regardless of id order", () => {
  const store = createVerdictStore(fakeStorage());
  assert.equal(verdictKey(["b", "a"]), "a,b");
  assert.equal(store.set(["b", "a"], { pick: "a", note: "clear" }), true);
  assert.deepEqual(store.get(["a", "b"]), { pick: "a", note: "clear" });
  assert.equal(store.get(["a", "c"]), null);
});

test("pick must be one of the ids or none, and the note is cut at 200", () => {
  const store = createVerdictStore(fakeStorage());
  assert.equal(store.set(["a", "b"], { pick: "zzz", note: "" }), false);
  assert.equal(store.get(["a", "b"]), null);
  assert.equal(store.set(["a", "b"], { pick: "none", note: "x".repeat(500) }), true);
  assert.equal(store.get(["a", "b"]).note.length, 200);
});

test("clear removes a verdict", () => {
  const store = createVerdictStore(fakeStorage());
  store.set(["a", "b"], { pick: "a", note: "" });
  store.clear(["b", "a"]);
  assert.equal(store.get(["a", "b"]), null);
});

test("a storage that throws gives null and set returns false", () => {
  const broken = { getItem() { throw new Error("no"); }, setItem() { throw new Error("full"); }, removeItem() { throw new Error("no"); } };
  const store = createVerdictStore(broken);
  assert.equal(store.get(["a", "b"]), null);
  assert.equal(store.set(["a", "b"], { pick: "a", note: "" }), false);
  store.clear(["a", "b"]);
  assert.equal(createVerdictStore(undefined).get(["a", "b"]), null);
});

test("garbage in storage is ignored", () => {
  for (const raw of ["not json", "[]", "null", '{"a,b":"x"}', '{"a,b":{"pick":5}}']) {
    const store = createVerdictStore(fakeStorage({ "aa.compareVerdicts": raw }));
    assert.equal(store.get(["a", "b"]), null, raw);
    assert.equal(store.set(["a", "b"], { pick: "a", note: "" }), true);
  }
});

test("the 51st verdict drops the oldest", () => {
  const store = createVerdictStore(fakeStorage());
  for (let i = 0; i < 51; i++) store.set([`a${i}`, `b${i}`], { pick: `a${i}`, note: "" });
  assert.equal(store.get(["a0", "b0"]), null);
  assert.notEqual(store.get(["a1", "b1"]), null);
  assert.notEqual(store.get(["a50", "b50"]), null);
});

test("a note can be kept without a pick", () => {
  const store = createVerdictStore(fakeStorage());
  assert.equal(store.set(["a", "b"], { pick: "", note: "hmm" }), true);
  assert.deepEqual(store.get(["a", "b"]), { pick: "", note: "hmm" });
});
