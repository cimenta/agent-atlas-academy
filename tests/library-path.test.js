import { test } from "node:test";
import assert from "node:assert/strict";
import { GOALS, LEVELS, levelOf, stepOf, kindOf, goalLevels, nextStep, coverageErrors, twinOf, groupPairs, pairKey } from "../public/js/library-path.js";
import { buildReplayList } from "../public/js/play-model.js";

test("the goals and levels of the path", () => {
  assert.deepEqual(GOALS, ["patterns", "save", "reliable", "wrong"]);
  assert.deepEqual(LEVELS, [1, 2, 3]);
});

test("a level is 1 to 3, anything else is 0", () => {
  assert.equal(levelOf({ level: 2 }), 2);
  assert.equal(levelOf({ level: "2" }), 0);
  assert.equal(levelOf({ level: 7 }), 0);
  assert.equal(levelOf({}), 0);
  assert.equal(levelOf(null), 0);
});

test("a step is a positive whole number for the goal, else 0", () => {
  assert.equal(stepOf({ paths: { patterns: 3 } }, "patterns"), 3);
  assert.equal(stepOf({ paths: { patterns: 3 } }, "save"), 0);
  assert.equal(stepOf({ paths: { patterns: 0 } }, "patterns"), 0);
  assert.equal(stepOf({ paths: { patterns: 1.5 } }, "patterns"), 0);
  assert.equal(stepOf({ paths: "x" }, "patterns"), 0);
  assert.equal(stepOf({}, "patterns"), 0);
});

test("a kind is pair or bad, else empty", () => {
  assert.equal(kindOf({ kind: "pair" }), "pair");
  assert.equal(kindOf({ kind: "bad" }), "bad");
  assert.equal(kindOf({ kind: "x" }), "");
  assert.equal(kindOf({}), "");
});

const runs = [
  { id: "c", level: 2, paths: { patterns: 3 }, tags: ["cost"] },
  { id: "a", level: 1, paths: { patterns: 1 }, tags: ["basics"] },
  { id: "b", level: 1, paths: { patterns: 2 }, tags: ["cost", "basics"] },
  { id: "d", level: 3, paths: { patterns: 4 } },
  { id: "x", level: 1, paths: { save: 1 } },
  { id: "bad", level: 9, paths: { patterns: 5 } },
];

test("the runs of a goal are grouped by level and sorted by step", () => {
  const levels = goalLevels(runs, "patterns");
  assert.deepEqual(levels[1].map((r) => r.id), ["a", "b"]);
  assert.deepEqual(levels[2].map((r) => r.id), ["c"]);
  assert.deepEqual(levels[3].map((r) => r.id), ["d"]);
});

test("tags keep only the runs that carry every tag, and an empty level is an empty list", () => {
  const levels = goalLevels(runs, "patterns", ["cost"]);
  assert.deepEqual(levels[1].map((r) => r.id), ["b"]);
  assert.deepEqual(levels[2].map((r) => r.id), ["c"]);
  assert.deepEqual(levels[3], []);
});

test("the next step is the first undone one of the filtered goal", () => {
  assert.equal(nextStep(runs, "patterns", new Set()).id, "a");
  assert.equal(nextStep(runs, "patterns", new Set(["patterns:a"])).id, "b");
  assert.equal(nextStep(runs, "patterns", new Set(["patterns:a"]), ["cost"]).id, "b");
  assert.equal(nextStep(runs, "patterns", new Set(["patterns:a", "patterns:b", "patterns:c", "patterns:d"])), null);
});

test("a goal with runs needs at least two on every level", () => {
  const good = [1, 1, 2, 2, 3, 3].map((level, i) => ({ id: `r${i}`, level, paths: { save: i + 1 } }));
  assert.deepEqual(coverageErrors(good), []);
  assert.deepEqual(coverageErrors(good.slice(0, 5)), ["save level 3 has 1 runs"]);
  assert.deepEqual(coverageErrors([{ id: "z", level: 1 }]), []);
});

test("the twin of a run is the run its twin id names", () => {
  const list = [{ id: "a", twin: "b" }, { id: "b", twin: "a" }, { id: "c", twin: "nope" }];
  assert.equal(twinOf(list, list[0]).id, "b");
  assert.equal(twinOf(list, list[2]), null);
  assert.equal(twinOf(list, { id: "d" }), null);
});

test("the list of the library keeps level, kind, twin and paths", () => {
  const item = buildReplayList([{ id: "a", title: "t", pattern: "sequential", level: 1, kind: "pair", twin: "b", paths: { patterns: 1 } }], []).gallery[0];
  assert.equal(item.level, 1);
  assert.equal(item.kind, "pair");
  assert.equal(item.twin, "b");
  assert.deepEqual(item.paths, { patterns: 1 });
});

test("two runs that name each other as a before and after pair are put together, a twin that is not in the list leaves the other alone", () => {
  const a = { id: "a", kind: "pair", twin: "b" };
  const b = { id: "b", kind: "pair", twin: "a" };
  const c = { id: "c" };
  const d = { id: "d", kind: "pair", twin: "gone" };
  const out = groupPairs([a, c, d, b]);
  assert.deepEqual(out, [{ pair: [a, b] }, c, d], "the second run moves up next to the first, in the place of the first");
  assert.deepEqual(groupPairs([b]), [b]);
  assert.deepEqual(groupPairs([{ id: "x", kind: "pair", twin: "y" }, { id: "y", kind: "pair", twin: "z" }]).map((e) => e.pair), [undefined, undefined], "twins that do not name each other are not paired");
  assert.deepEqual(groupPairs([{ id: "p", kind: "bad", twin: "q" }, { id: "q", kind: "bad", twin: "p" }]).map((e) => e.pair), [undefined, undefined], "only the kind pair is framed");
  assert.equal(pairKey(b, a), "a");
});
