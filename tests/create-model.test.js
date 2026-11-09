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
