import { test } from "node:test";
import assert from "node:assert/strict";
import { retryChoices, withRetryChoice } from "../public/js/replay/retry-choice.js";

const design = () => ({
  pattern: "sequential",
  nodes: [
    { id: "researcher", agent: "researcher", model: "fast", slot: "anthropic" },
    { id: "critic", agent: "critic", model: "balanced", slot: "google-free", custom: true },
  ],
  edges: [{ from: "researcher", to: "critic" }],
});

test("the failed model is marked and the Gemini models keep the free slot where they have a free tier", () => {
  const list = retryChoices(design(), "critic");
  assert.equal(list.length, 9);
  assert.deepEqual(list.filter((c) => c.current).map((c) => c.id), ["gemini-3.8-flash"]);
  assert.deepEqual(list.find((c) => c.id === "gemini-3.5-flash-lite").value, { slot: "google-free", model: "fast" });
  assert.deepEqual(list.find((c) => c.id === "gemini-4-carbon").value, { slot: "google", model: "strong" });
  assert.deepEqual(list.find((c) => c.id === "claude-haiku-5-5").value, { slot: "anthropic", model: "fast" });
});

test("a choice changes only that agent, in the design and in the recorded one, and keeps the original run", () => {
  const run = { design: design(), recordedWith: { provider: "anthropic+google", freeTier: false }, events: [{ type: "run_start", design: design() }] };
  const next = withRetryChoice(run, "critic", { slot: "anthropic", model: "fast" });
  assert.deepEqual(next.design.nodes[1], { id: "critic", agent: "critic", model: "fast", slot: "anthropic", custom: true });
  assert.deepEqual(next.events[0].design.nodes[1].slot, "anthropic");
  assert.equal(next.design.nodes[0].slot, "anthropic");
  assert.equal(run.design.nodes[1].slot, "google-free");
  assert.equal(next.recordedWith.freeTier, false);
  const free = withRetryChoice(run, "researcher", { slot: "google-free", model: "fast" });
  assert.equal(free.recordedWith.freeTier, true);
});

import { buildResultModel } from "../public/js/play-model.js";

test("an agent on a free Gemini key adds nothing to the cost of a mixed run", () => {
  const events = [
    { type: "agent_output", agent: "researcher", text: "a", tokens: { input: 1000000, output: 0 }, t: 1 },
    { type: "agent_output", agent: "critic", text: "b", tokens: { input: 1000000, output: 1000000 }, t: 2 },
    { type: "done", outcome: "finished", usage: { input: 2000000, output: 1000000, searches: 0 }, t: 3 },
  ];
  const run = { design: design(), events, recordedWith: { provider: "anthropic+google", freeTier: false } };
  assert.equal(buildResultModel(run).cost, 1); // only the Haiku input: 1M tokens at 1 USD
});

import { clampTimeoutSec } from "../public/js/engine/catalog.js";
import { createRunHandler } from "../lib/run-handler.js";

test("the request timeout stays between 30 and 120 seconds and defaults to 60", () => {
  assert.equal(clampTimeoutSec(5), 30);
  assert.equal(clampTimeoutSec(500), 120);
  assert.equal(clampTimeoutSec(90), 90);
  assert.equal(clampTimeoutSec("x"), 60);
  assert.equal(clampTimeoutSec(undefined), 60);
});
