import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildReplayList, buildResultModel } from "../public/js/play-model.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { buildRunRecord } from "../public/js/engine/run-record.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const design = {
  pattern: "sequential",
  nodes: [
    { id: "planner", agent: "planner", model: "fast", search: false },
    { id: "writer", agent: "writer", model: "balanced", search: false },
  ],
  edges: [{ from: "planner", to: "writer" }],
};

async function mockRun() {
  const events = [];
  await runDesign({ design, task: "Why is the sky blue?", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  return { events, run: buildRunRecord({ id: "local-m", design, task: "Why is the sky blue?", events, limits: LIMIT_DEFAULTS, language: "en", appVersion: "0.3.0" }) };
}

test("buildReplayList keeps gallery order and sorts mine newest first with the right source", () => {
  const gallery = [
    { id: "g1", title: "One", pattern: "sequential" },
    { id: "g2", title: "Two", pattern: "debate" },
  ];
  const local = [
    { id: "l1", title: "Old", pattern: "parallel", outcome: "finished", createdAt: 100 },
    { id: "l2", title: "New", pattern: "debate", outcome: "stopped_user", createdAt: 300 },
    { id: "l3", title: "Mid", pattern: "supervisor", outcome: "failed", createdAt: 200 },
  ];
  const list = buildReplayList(gallery, local);
  assert.deepEqual(list.gallery.map((r) => r.id), ["g1", "g2"]);
  assert.ok(list.gallery.every((r) => r.source === "gallery"));
  assert.deepEqual(list.mine.map((r) => r.id), ["l2", "l3", "l1"]);
  assert.ok(list.mine.every((r) => r.source === "local"));
  assert.equal(list.mine[0].outcome, "stopped_user");
});

test("buildResultModel on a finished mock run", async () => {
  const { events, run } = await mockRun();
  const model = buildResultModel(run);
  const done = events.at(-1);
  assert.equal(model.status, "finished");
  assert.equal(model.finalText, done.finalText);
  assert.deepEqual(model.usage, { input: done.usage.input, output: done.usage.output, searches: done.usage.searches });
  assert.deepEqual(model.perAgent.map((a) => a.agent), ["planner", "writer"]);
  assert.equal(model.perAgent.reduce((n, a) => n + a.input, 0), done.usage.input);
  assert.equal(typeof model.cost, "number");
  assert.ok(model.cost > 0);
});

test("a run without a design has no cost", () => {
  const sample = JSON.parse(readFileSync(new URL("./fixtures/sample-run.json", import.meta.url), "utf8"));
  const model = buildResultModel(sample);
  assert.equal(model.cost, null);
  assert.ok(Array.isArray(model.perAgent));
});

test("a run with no done event is interrupted and falls back to the last agent output", async () => {
  const { events } = await mockRun();
  const cut = events.filter((e) => e.type !== "done");
  const run = buildRunRecord({ id: "local-c", design, task: "t", events: cut, limits: LIMIT_DEFAULTS, language: "en", appVersion: "0.3.0" });
  const model = buildResultModel(run);
  assert.equal(model.status, "interrupted");
  assert.equal(model.finalText, cut.filter((e) => e.type === "agent_output").at(-1).text);
});

import fs from "node:fs";
import { filterLibrary, buildStatistics } from "../public/js/play-model.js";
import { safeFileName } from "../public/js/download.js";

const items = [
  { id: "a", title: "Why is the sky blue?", pattern: "sequential" },
  { id: "b", title: "Best living chess player", pattern: "sequential", tags: ["chess", "web search"] },
  { id: "c", title: "Compare two phones", pattern: "parallel" },
];

test("filterLibrary returns everything for an empty search", () => {
  assert.equal(filterLibrary(items, "").length, 3);
  assert.equal(filterLibrary(items, "   ").length, 3);
});

test("filterLibrary needs every word and looks in title, pattern, id and tags, ignoring case", () => {
  assert.deepEqual(filterLibrary(items, "CHESS").map((i) => i.id), ["b"]);
  assert.deepEqual(filterLibrary(items, "sequential sky").map((i) => i.id), ["a"]);
  assert.deepEqual(filterLibrary(items, "web").map((i) => i.id), ["b"]);
  assert.deepEqual(filterLibrary(items, "parallel").map((i) => i.id), ["c"]);
  assert.deepEqual(filterLibrary(items, "nothing"), []);
});

test("buildStatistics lists each started agent with its time, tokens and share", () => {
  const run = JSON.parse(fs.readFileSync(new URL("../public/runs/sequential-simple.json", import.meta.url), "utf8"));
  const stats = buildStatistics(run);
  assert.ok(stats.perAgent.length >= 2);
  const share = stats.perAgent.reduce((n, a) => n + a.share, 0);
  assert.ok(Math.abs(share - 1) < 1e-9);
  assert.equal(stats.status, "finished");
  assert.ok(stats.totalMs > 0);
});

test("buildStatistics prefers the recorded duration and keeps start and end times", () => {
  const run = JSON.parse(fs.readFileSync(new URL("../public/runs/sequential-simple.json", import.meta.url), "utf8"));
  const stats = buildStatistics({ ...run, durationMs: 4321, startedAt: "2026-11-10T08:00:00.000Z", endedAt: "2026-11-10T08:00:04.321Z" });
  assert.equal(stats.totalMs, 4321);
  assert.equal(stats.startedAt, "2026-11-10T08:00:00.000Z");
});

test("safeFileName keeps letters and digits and never returns an empty name", () => {
  assert.equal(safeFileName("Best living chess player?"), "Best-living-chess-player");
  assert.equal(safeFileName("???", "run"), "run");
  assert.equal(safeFileName(undefined, "x"), "x");
});

import { prepareImport } from "../public/js/play-model.js";

test("prepareImport accepts a valid run and gives it a fresh id", () => {
  const run = JSON.parse(fs.readFileSync(new URL("../public/runs/sequential-simple.json", import.meta.url), "utf8"));
  const result = prepareImport(JSON.stringify(run), () => "local-new-0001");
  assert.equal(result.ok, true);
  assert.equal(result.run.id, "local-new-0001");
  assert.equal(result.run.title, run.title);
});

test("prepareImport rejects text that is not JSON, not an object or not a run", () => {
  assert.deepEqual(prepareImport("{oops", () => "x"), { ok: false, reason: "json" });
  assert.equal(prepareImport("[1,2]", () => "x").reason, "invalid");
  assert.equal(prepareImport("null", () => "x").reason, "invalid");
  assert.equal(prepareImport('{"title":"a"}', () => "x").reason, "invalid");
});

import { pickHomeRun } from "../public/js/play-model.js";

test("the home page plays the run marked home, else the first one", () => {
  assert.equal(pickHomeRun([{ id: "a" }, { id: "b", home: true }, { id: "c" }]).id, "b");
  assert.equal(pickHomeRun([{ id: "a" }, { id: "b" }]).id, "a");
  assert.equal(pickHomeRun([]), undefined);
  assert.equal(pickHomeRun(undefined), undefined);
});

test("formatRunWhen gives the date and time of a run, and nothing when it is unknown", async () => {
  const { formatRunWhen } = await import("../public/js/play-model.js");
  const when = formatRunWhen(Date.UTC(2026, 10, 11, 9, 40), "en");
  assert.match(when, /2026/);
  assert.match(when, /\d{1,2}:\d{2}/);
  assert.equal(formatRunWhen(undefined, "en"), "");
  assert.equal(formatRunWhen(Number.NaN, "en"), "");
});
