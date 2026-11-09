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
  const sample = JSON.parse(readFileSync(new URL("../public/runs/sample-sequential.json", import.meta.url), "utf8"));
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
