import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { formatMinutes, libraryStats, statsTable } from "../public/js/library-stats.js";

const items = [
  { id: "a", level: 1, paths: { patterns: 1 }, runSeconds: 30, studyMinutes: 10 },
  { id: "b", level: 2, paths: { patterns: 2, save: 1 }, runSeconds: 90, studyMinutes: 20 },
  { id: "c", level: 3, paths: { save: 2 }, runSeconds: 60, studyMinutes: 5 },
  { id: "d", paths: {} },
];

test("libraryStats counts runs per goal and level, adds the times, and counts a run on two goals in both rows but once in the total", () => {
  const s = libraryStats(items);
  const goal = (id) => s.goals.find((g) => g.id === id);
  assert.deepEqual(goal("patterns").levels, [1, 1, 0]);
  assert.equal(goal("patterns").runs, 2);
  assert.equal(goal("patterns").seconds, 120);
  assert.equal(goal("save").minutes, 25);
  assert.deepEqual(s.total, { runs: 4, seconds: 180, minutes: 35 });
  assert.equal(goal("wrong").runs, 0);
  assert.deepEqual(libraryStats(null).total, { runs: 0, seconds: 0, minutes: 0 });
});

test("formatMinutes writes minutes, hours with two-digit minutes, and less than a minute", () => {
  assert.equal(formatMinutes(0.2), "<1 min");
  assert.equal(formatMinutes(12), "12 min");
  assert.equal(formatMinutes(65), "1 h 05 min");
});

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  append(...n) { this.children.push(...n); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(" "); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const t = (key) => String(en[key] ?? `MISSING ${key}`);

test("the table has a row per goal, a total, a Study column and a study header that explains the method on hover", () => {
  const table = statsTable({ doc, t, items });
  assert.equal(table.find((e) => e.tag === "tr").length, 6, "head, four goals, total");
  assert.match(table.text, /Study/);
  assert.doesNotMatch(table.text, /MISSING/);
  const head = table.find((e) => e.attrs["data-ui"] === "stats-study-head")[0];
  assert.equal(head.attrs.tabindex, "0");
  assert.match(head.attrs["data-hover-text"], /160 words a minute/);
  assert.equal(table.find((e) => e.attrs["data-ui"] === "stats-total")[0].find((e) => e.attrs["data-ui"] === "stats-study")[0].text, "35 min");
});
