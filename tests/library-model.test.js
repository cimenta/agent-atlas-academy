import { test } from "node:test";
import assert from "node:assert/strict";
import { runFacts, searchText } from "../public/js/library-model.js";
import { filterLibrary, buildReplayList } from "../public/js/play-model.js";

const run = (extra = {}) => ({
  schemaVersion: 1, id: "r1", title: "Explain the sky", language: "en", pattern: "sequential", recordedWith: { provider: "groq+cloudflare", model: "x" },
  events: [], task: "t", outcome: "stopped_limit", createdAt: 5,
  design: { pattern: "sequential", nodes: [
    { id: "a", agent: "planner", model: "fast", search: false, slot: "groq-free" },
    { id: "b", agent: "writer", model: "strong", search: false, slot: "cloudflare-free" },
  ], edges: [{ from: "a", to: "b" }] },
  limits: { maxSteps: 20, maxTokens: 40000, maxSearches: 3 }, ...extra,
});

test("runFacts reads the agents, providers, models, limits, API log and calls from the run", () => {
  const f = runFacts(run({ apiCalls: [{}, {}, {}] }));
  assert.equal(f.agents, 2);
  assert.deepEqual(f.providers, ["groq", "cloudflare"]);
  assert.equal(f.models.length, 2);
  assert.equal(f.models[1].provider, "cloudflare");
  assert.match(f.models[1].model, /qwen/);
  assert.equal(f.hasApiLog, true);
  assert.equal(f.calls, 3);
  assert.equal(f.limits.maxSteps, 20);
  assert.equal(f.outcome, "stopped_limit");
});

test("runFacts of an older run without an API log and without slots falls back to the recorded provider", () => {
  const old = run({ recordedWith: { provider: "anthropic", model: "x" }, design: { pattern: "sequential", nodes: [{ id: "a", agent: "writer", model: "fast", search: false }], edges: [] } });
  const f = runFacts(old);
  assert.equal(f.hasApiLog, false);
  assert.equal(f.calls, 0);
  assert.deepEqual(f.providers, ["anthropic"]);
  assert.equal(f.models[0].provider, "anthropic");
});

test("runFacts survives a run without a design", () => {
  const f = runFacts({ id: "x" });
  assert.equal(f.agents, 0);
  assert.deepEqual(f.models, []);
});

test("searchText holds the title, pattern, providers, outcome and the detail text", () => {
  const text = searchText({ title: "Explain the sky", pattern: "voting", provider: "groq", outcome: "stopped_limit", id: "r1" }, { about: "A limit that stops the run" }).toLowerCase();
  for (const word of ["explain the sky", "voting", "groq", "stopped_limit", "limit that stops"]) assert.ok(text.includes(word), word);
});

test("filterLibrary finds a run by a word of its detail text when texts are given", () => {
  const items = [{ id: "a", title: "One", pattern: "sequential" }, { id: "b", title: "Two", pattern: "debate" }];
  const texts = { a: "about rate limits", b: "about judges" };
  assert.deepEqual(filterLibrary(items, "rate", texts).map((i) => i.id), ["a"]);
  assert.deepEqual(filterLibrary(items, "rate").map((i) => i.id), []);
  assert.equal(filterLibrary(items, "").length, 2);
});

test("buildReplayList passes provider, outcome and date of a library entry through", () => {
  const list = buildReplayList([{ id: "g", title: "G", pattern: "debate", provider: "groq", outcome: "finished", recordedAt: 7 }], []);
  assert.equal(list.gallery[0].provider, "groq");
  assert.equal(list.gallery[0].outcome, "finished");
  assert.equal(list.gallery[0].createdAt, 7);
});

test("runFacts survives a design whose nodes are not objects", async () => {
  const { runFacts } = await import("../public/js/library-model.js");
  const facts = runFacts({ design: { pattern: "sequential", nodes: [null, "x", { id: "a", agent: "writer", model: "fast" }], edges: [] }, recordedWith: { provider: "groq" } });
  assert.equal(facts.agents, 1);
  assert.equal(facts.models.length, 1);
});
