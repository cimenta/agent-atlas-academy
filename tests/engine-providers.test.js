import { test } from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_IDS, providerCatalog, pricesFor, paidOnlyModelUsed, MODELS, SEARCH_PRICE_USD } from "../public/js/engine/catalog.js";
import { estimateRun } from "../public/js/engine/estimate.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { createRunHandler } from "../lib/run-handler.js";

const design = (model = "fast", search = false) => ({
  pattern: "sequential",
  nodes: [
    { id: "a", agent: "planner", model, search },
    { id: "b", agent: "writer", model, search: false },
  ],
  edges: [{ from: "a", to: "b" }],
});

test("two providers exist and unknown ones fall back to Anthropic", () => {
  assert.deepEqual(PROVIDER_IDS, ["anthropic", "google"]);
  assert.equal(providerCatalog("anthropic").models, MODELS);
  assert.equal(providerCatalog("nope"), providerCatalog("anthropic"));
  assert.equal(providerCatalog("anthropic").searchPriceUsd, SEARCH_PRICE_USD);
});

test("Google has the same three model keys, prices and a search price", () => {
  const google = providerCatalog("google");
  assert.deepEqual(google.models.map((m) => m.key), ["fast", "balanced", "strong"]);
  assert.ok(google.models.every((m) => m.id.startsWith("gemini-") && m.inputPerMTok > 0 && m.outputPerMTok > 0));
  assert.ok(google.searchPriceUsd > 0);
  assert.match(google.pricesAsOf, /^\d{4}-\d{2}-\d{2}$/);
});

test("the strong Google model has no free tier, the others do", () => {
  assert.equal(paidOnlyModelUsed(design("fast"), "google"), false);
  assert.equal(paidOnlyModelUsed(design("balanced"), "google"), false);
  assert.equal(paidOnlyModelUsed(design("strong"), "google"), true);
  assert.equal(paidOnlyModelUsed(design("strong"), "anthropic"), false);
});

test("the estimate uses the prices of the chosen provider", () => {
  const limits = { maxSteps: 20, maxTokens: 40000, maxSearches: 3 };
  const a = estimateRun(design("fast", true), limits, pricesFor("anthropic"));
  const g = estimateRun(design("fast", true), limits, pricesFor("google"));
  assert.notEqual(a.totalUsd, g.totalUsd);
  assert.equal(g.pricesAsOf, providerCatalog("google").pricesAsOf);
  assert.equal(a.pricesAsOf, providerCatalog("anthropic").pricesAsOf);
});

test("a run with provider google asks the provider for a Gemini model id", async () => {
  const seen = [];
  const call = async (body) => {
    seen.push(body.model);
    return { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
  };
  await runDesign({ design: design("balanced"), task: "t", limits: { maxSteps: 5, maxTokens: 10000, maxSearches: 1 }, call, emit: () => {}, provider: "google" });
  assert.ok(seen.length > 0 && seen.every((id) => id === "gemini-3.8-flash"));
});

function fakeResponse() {
  return { statusCode: 0, headers: {}, chunks: [], setHeader(k, v) { this.headers[k] = v; }, flushHeaders() {}, write(c) { this.chunks.push(c); }, end(c) { if (c) this.chunks.push(c); this.ended = true; }, on() {} };
}
const request = (body) => ({ method: "POST", headers: {}, socket: {}, body });
const GOOGLE_KEY = "AIzaSy" + "x".repeat(33);

test("the server checks a Google key and calls the Google function", async () => {
  const calls = [];
  const handler = createRunHandler({
    call: async () => assert.fail("anthropic must not be called"),
    callGoogle: async (body, opts) => {
      calls.push({ model: body.model, apiKey: opts.apiKey });
      return { content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
    },
    rateLimitImpl: () => true,
  });
  const res = fakeResponse();
  await handler(request({ provider: "google", apiKey: GOOGLE_KEY, task: "hello", design: design("fast"), limits: {} }), res);
  assert.equal(res.statusCode, 200);
  assert.ok(calls.length > 0 && calls[0].model.startsWith("gemini-") && calls[0].apiKey === GOOGLE_KEY);
});

test("an Anthropic key is refused as a Google key, and the newer AQ. Google keys are accepted", async () => {
  const handler = createRunHandler({ rateLimitImpl: () => true });
  const res = fakeResponse();
  await handler(request({ provider: "google", apiKey: "sk-ant-" + "x".repeat(40), task: "t", design: design() }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.chunks.join(""), /bad_key/);
  const ok = fakeResponse();
  const h2 = createRunHandler({ callGoogle: async () => ({ content: [{ type: "text", text: "x" }], stop_reason: "end_turn", usage: {} }), rateLimitImpl: () => true });
  await h2(request({ provider: "google", apiKey: "AQ." + "x".repeat(50), task: "t", design: design("fast"), limits: {} }), ok);
  assert.equal(ok.statusCode, 200);
});

test("an unknown provider is refused", async () => {
  const handler = createRunHandler({ rateLimitImpl: () => true });
  const res = fakeResponse();
  await handler(request({ provider: "nope", apiKey: "x".repeat(40), task: "t", design: design() }), res);
  assert.equal(res.statusCode, 400);
  assert.match(res.chunks.join(""), /bad_provider/);
});

import { buildRunRecord, modelsUsed } from "../public/js/engine/run-record.js";
import { buildResultModel, buildStatistics } from "../public/js/play-model.js";
import { reviewSummary } from "../public/js/create/create-model.js";

const runEvents = (model = "fast") => [
  { type: "run_start", t: 0, task: "t", pattern: "sequential", design: design(model) },
  { type: "agent_start", t: 1, agent: "a", role: "Planner", model: "m", tools: [], system: "s" },
  { type: "agent_output", t: 2, agent: "a", text: "x", tokens: { input: 1000000, output: 1000000 } },
  { type: "done", t: 3, outcome: "finished", usage: { input: 1000000, output: 1000000, searches: 0, steps: 1 }, finalText: "x" },
];

test("modelsUsed names the models of the chosen provider", () => {
  assert.equal(modelsUsed(design("fast"), "google"), "gemini-3.5-flash-lite");
  assert.equal(modelsUsed(design("fast")), "claude-haiku-5-5");
});

test("a run record remembers the provider and whether the key was on the free tier", () => {
  const rec = buildRunRecord({ id: "local-x", design: design(), task: "t", events: runEvents(), limits: {}, language: "en", appVersion: "1", provider: "google", freeTier: true });
  assert.deepEqual(rec.recordedWith, { provider: "google", model: "gemini-3.5-flash-lite", freeTier: true });
  const plain = buildRunRecord({ id: "local-y", design: design(), task: "t", events: runEvents(), limits: {}, language: "en", appVersion: "1" });
  assert.deepEqual(plain.recordedWith, { provider: "anthropic", model: "claude-haiku-5-5" });
});

test("the result prices a Google run with Google prices and shows a free-tier run as free", () => {
  const base = { design: design("fast"), events: runEvents("fast") };
  const paid = buildResultModel({ ...base, recordedWith: { provider: "google", model: "m" } });
  assert.ok(Math.abs(paid.cost - (0.3 + 2.5)) < 1e-9);
  assert.equal(paid.free, false);
  const free = buildResultModel({ ...base, recordedWith: { provider: "google", model: "m", freeTier: true } });
  assert.equal(free.free, true);
  assert.equal(buildStatistics({ ...base, recordedWith: { provider: "google", model: "m", freeTier: true } }).free, true);
  const strong = buildResultModel({ design: design("strong"), events: runEvents("strong"), recordedWith: { provider: "google", model: "m", freeTier: true } });
  assert.equal(strong.free, false);
  assert.ok(Math.abs(strong.cost - 12) < 1e-9);
  const old = buildResultModel({ ...base });
  assert.ok(Math.abs(old.cost - 6) < 1e-9);
});

test("the review summary estimates with the chosen provider", () => {
  const limits = { maxSteps: 20, maxTokens: 40000, maxSearches: 3 };
  assert.notEqual(reviewSummary({ design: design("fast"), limits, provider: "google" }).estimate.costUsd, reviewSummary({ design: design("fast"), limits }).estimate.costUsd);
});
