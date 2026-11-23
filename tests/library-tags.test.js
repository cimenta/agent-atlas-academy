import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { TAG_GROUPS, groupOfTag, tagCounts, filterByTags, cloudRows, tagWeight } from "../public/js/library-tags.js";
import { buildReplayList } from "../public/js/play-model.js";

const runs = [
  { id: "a", tags: ["basics", "handoff"] },
  { id: "b", tags: ["handoff", "speed"] },
  { id: "c", tags: ["handoff", "basics", "speed"] },
  { id: "d" },
];

test("tags are counted once per run, and a run without tags adds nothing", () => {
  const counts = tagCounts([...runs, { id: "e", tags: ["speed", "speed"] }]);
  assert.equal(counts.get("handoff"), 3);
  assert.equal(counts.get("speed"), 3);
  assert.equal(counts.get("basics"), 2);
  assert.equal(counts.size, 3);
});

test("a run must carry every chosen tag, and no choice keeps every run", () => {
  assert.deepEqual(filterByTags(runs, []).map((r) => r.id), ["a", "b", "c", "d"]);
  assert.deepEqual(filterByTags(runs, ["handoff"]).map((r) => r.id), ["a", "b", "c"]);
  assert.deepEqual(filterByTags(runs, ["handoff", "speed"]).map((r) => r.id), ["b", "c"]);
  assert.deepEqual(filterByTags(runs, new Set(["basics", "speed"])).map((r) => r.id), ["c"]);
  assert.deepEqual(filterByTags(runs, ["nothing"]), []);
});

test("the most frequent tag is in the middle of the middle row, and every tag is placed once", () => {
  const counts = new Map(Array.from({ length: 15 }, (_, i) => [`t${String(i).padStart(2, "0")}`, i === 7 ? 9 : 2]));
  const rows = cloudRows(counts);
  assert.equal(rows.length, 5);
  const middle = rows[2];
  assert.equal(middle.length, 3);
  assert.equal(middle[1], "t07");
  assert.deepEqual(rows.flat().sort(), [...counts.keys()].sort());
});

test("small clouds still work: nothing, one row, and three rows", () => {
  assert.deepEqual(cloudRows(new Map()), []);
  assert.deepEqual(cloudRows(new Map([["x", 1], ["y", 4]])), [["y", "x"]]);
  const nine = new Map(Array.from({ length: 9 }, (_, i) => [`t${i}`, 9 - i]));
  assert.equal(cloudRows(nine).length, 3);
  assert.equal(cloudRows(nine)[1].includes("t0"), true);
});

test("the weight of a tag runs from nothing to one", () => {
  assert.equal(tagWeight(4, 4), 1);
  assert.equal(tagWeight(1, 4), 0.5);
  assert.equal(tagWeight(0, 0), 0);
});

test("a tag outside the groups is drawn like the basics", () => {
  assert.equal(groupOfTag("speed"), "efficiency");
  assert.equal(groupOfTag("something-new"), "basics");
});

test("the list of the library keeps the tags of a run", () => {
  const built = buildReplayList([{ id: "x", title: "X", pattern: "sequential", tags: ["basics"] }, { id: "y", title: "Y", pattern: "parallel" }], []);
  assert.deepEqual(built.gallery[0].tags, ["basics"]);
  assert.equal("tags" in built.gallery[1], false);
});

test("every tag of the library index is in a group and has a word in English and in Czech", () => {
  const read = (p) => JSON.parse(fs.readFileSync(new URL(p, import.meta.url), "utf8"));
  const index = read("../public/runs/index.json");
  const en = read("../public/locales/en.json");
  const cs = read("../public/locales/cs.json");
  const grouped = new Set(Object.values(TAG_GROUPS).flat());
  for (const run of index.runs) {
    assert.ok(Array.isArray(run.tags) && run.tags.length >= 3, `${run.id} has tags`);
    for (const tag of run.tags) {
      assert.ok(grouped.has(tag), `${tag} is in a group`);
      assert.ok(`tag.${tag}` in en && `tag.${tag}` in cs, `${tag} has both words`);
      assert.notEqual(en[`tag.${tag}`], cs[`tag.${tag}`], `${tag} is translated`);
    }
  }
});
