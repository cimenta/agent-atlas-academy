import { test } from "node:test";
import assert from "node:assert/strict";
import { canRun, reviewSummary, runOutcomeMessageKey } from "../public/js/create/create-model.js";
import { estimateRun } from "../public/js/engine/estimate.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const good = { task: "Why is the sky blue?", apiKey: "sk-ant-api03-xxxxxxxxxxxxxxxxxxxx", editorErrors: [] };

test("canRun is ok when the task, key and design are fine", () => {
  assert.deepEqual(canRun(good), { ok: true, reasons: [] });
});

test("canRun lists every reason that blocks the run", () => {
  assert.deepEqual(canRun({ ...good, task: "" }).reasons, ["noTask"]);
  assert.deepEqual(canRun({ ...good, task: "   " }).reasons, ["noTask"]);
  assert.deepEqual(canRun({ ...good, task: "x".repeat(1001) }).reasons, ["taskTooLong"]);
  assert.deepEqual(canRun({ ...good, apiKey: null }).reasons, ["noKey"]);
  assert.deepEqual(canRun({ ...good, editorErrors: [{ code: "seq.notChain" }] }).reasons, ["designInvalid"]);
  const all = canRun({ task: "", apiKey: "", editorErrors: [{ code: "node.count" }] });
  assert.equal(all.ok, false);
  assert.deepEqual(all.reasons, ["noTask", "noKey", "designInvalid"]);
});

test("a task of exactly 1000 characters is accepted", () => {
  assert.equal(canRun({ ...good, task: "x".repeat(1000) }).ok, true);
});

const design = {
  pattern: "sequential",
  nodes: [
    { id: "researcher", agent: "researcher", model: "balanced", search: true },
    { id: "free", agent: "free", model: "fast", search: false, name: "Poet", instructions: "Rhyme." },
  ],
  edges: [{ from: "researcher", to: "free" }],
};

test("reviewSummary lists the agents with labels and flags web search", () => {
  const summary = reviewSummary({ design, limits: LIMIT_DEFAULTS });
  assert.deepEqual(summary.agents, [
    { id: "researcher", label: "Researcher", model: "balanced", search: true },
    { id: "free", label: "Poet", model: "fast", search: false },
  ]);
  assert.equal(summary.hasSearch, true);
});

test("reviewSummary has no search flag when no agent searches", () => {
  const noSearch = { ...design, nodes: design.nodes.map((n) => ({ ...n, search: false })) };
  assert.equal(reviewSummary({ design: noSearch, limits: LIMIT_DEFAULTS }).hasSearch, false);
});

test("the estimate equals estimateRun for the same inputs", () => {
  const summary = reviewSummary({ design, limits: LIMIT_DEFAULTS });
  assert.deepEqual(summary.estimate, estimateRun(design, LIMIT_DEFAULTS));
});

test("runOutcomeMessageKey maps each outcome and falls back for an unknown one", () => {
  for (const outcome of ["finished", "stopped_user", "stopped_limit", "interrupted", "failed"]) {
    assert.equal(runOutcomeMessageKey(outcome), `run.outcome.${outcome}`);
  }
  assert.equal(runOutcomeMessageKey("weird"), "run.outcome.failed");
  assert.equal(runOutcomeMessageKey(undefined), "run.outcome.failed");
});

test("describeOutcome: finished passes, a requested stop or a limit warns, anything else fails", async () => {
  const { describeOutcome } = await import("../public/js/create/create-model.js");
  assert.equal(describeOutcome({ outcome: "finished", events: [] }).level, "ok");
  assert.equal(describeOutcome({ outcome: "stopped_user", events: [] }).level, "warn");
  assert.equal(describeOutcome({ outcome: "stopped_limit", events: [] }).level, "warn");
  for (const outcome of ["failed", "interrupted", undefined, "nonsense"]) assert.equal(describeOutcome({ outcome, events: [] }).level, "fail");
  assert.deepEqual(["ok", "warn", "fail"].map((l) => describeOutcome({ outcome: { ok: "finished", warn: "stopped_user", fail: "failed" }[l], events: [] }).icon), ["✓", "!", "✕"]);
});

test("describeOutcome takes the duration from the last event and the cost as given", async () => {
  const { describeOutcome } = await import("../public/js/create/create-model.js");
  const info = describeOutcome({ outcome: "finished", events: [{ t: 0 }, { t: 87800 }], cost: 0.0123 });
  assert.equal(info.durationMs, 87800);
  assert.equal(info.cost, 0.0123);
  const none = describeOutcome({ outcome: "failed", events: [], cost: null });
  assert.deepEqual([none.durationMs, none.cost], [null, null]);
});

test("formatDuration and formatUsd", async () => {
  const { formatDuration, formatUsd } = await import("../public/js/create/create-model.js");
  assert.equal(formatDuration(87800), "1 min 28 s");
  assert.equal(formatDuration(5300), "5.3 s");
  assert.equal(formatDuration(-1), "");
  assert.equal(formatUsd(0.01234), "0.0123");
  assert.equal(formatUsd(1.2345), "1.23");
  assert.equal(formatUsd(null), "");
});

test("canRun says the saved key is locked when one is saved but not unlocked", () => {
  assert.deepEqual(canRun({ ...good, apiKey: null, keyLocked: true }).reasons, ["keyLocked"]);
  assert.deepEqual(canRun({ ...good, apiKey: null }).reasons, ["noKey"]);
});

test("runOutcomeMessageKey names the limit a run stopped at and falls back when unknown", () => {
  for (const reason of ["time", "steps", "tokens", "searches"]) {
    assert.equal(runOutcomeMessageKey("stopped_limit", reason), `run.outcome.stopped_limit.${reason}`);
  }
  assert.equal(runOutcomeMessageKey("stopped_limit"), "run.outcome.stopped_limit");
  assert.equal(runOutcomeMessageKey("stopped_limit", "bogus"), "run.outcome.stopped_limit");
  assert.equal(runOutcomeMessageKey("failed", "tokens"), "run.outcome.failed");
});
