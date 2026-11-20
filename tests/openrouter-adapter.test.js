import { test } from "node:test";
import assert from "node:assert/strict";
import { toChatRequest } from "../public/js/engine/openai-compat.js";
import { callOpenrouter, listOpenrouterModels } from "../public/js/engine/openrouter.js";
import { redact } from "../public/js/engine/anthropic.js";
import { providerCalls } from "../lib/provider-calls.js";
import { createRunHandler } from "../lib/run-handler.js";
import { createModelsHandler } from "../lib/models-handler.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { PROVIDER_IDS } from "../public/js/engine/providers.js";

const KEY = `sk-or-v1-${"k".repeat(48)}`;
const reply = (status, data, headers = {}) => ({ ok: status < 400, status, headers: new Headers(headers), json: async () => data });
const schema = { type: "object", properties: { a: { type: "string" } } };
const body = (extra = {}) => ({ model: "m", max_tokens: 50, replySchema: schema, messages: [{ role: "user", content: "Hi" }], ...extra });

test("the reply format is forced only for a model that accepts it", () => {
  assert.equal(toChatRequest(body(), { model: "m" }).response_format.type, "json_schema");
  assert.equal(toChatRequest(body(), { model: "m", forcedFormat: true }).response_format.type, "json_schema");
  assert.equal("response_format" in toChatRequest(body(), { model: "m", forcedFormat: false }), false);
  // Groq keeps its request exactly as before
  const groq = toChatRequest(body(), { model: "m" });
  assert.equal(groq.max_completion_tokens, 50);
  assert.equal(groq.reasoning_effort, "low");
});

test("callOpenrouter sends to the OpenRouter address with a bearer key and the right size field", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return reply(200, { choices: [{ message: { content: "ok" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2 } });
  };
  const answer = await callOpenrouter(body({ model: "google/gemma-4-26b-a4b-it:free" }), { apiKey: KEY, fetchImpl, forcedFormat: false });
  assert.equal(seen[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(seen[0].init.headers.authorization, `Bearer ${KEY}`);
  const sent = JSON.parse(seen[0].init.body);
  assert.equal(sent.model, "google/gemma-4-26b-a4b-it:free");
  assert.equal(sent.max_tokens, 50);
  assert.equal("max_completion_tokens" in sent, false);
  assert.equal("reasoning_effort" in sent, false);
  assert.equal("response_format" in sent, false);
  assert.equal(answer.model, "google/gemma-4-26b-a4b-it:free");
});

test("a 429 that names the free-models day limit is a day limit; a short one without retry-after has no wait", async () => {
  const run = (data, headers) => callOpenrouter(body({ replySchema: undefined }), { apiKey: KEY, fetchImpl: async () => reply(429, data, headers) }).catch((e) => e);
  const day = await run({ error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day" } }, { "x-ratelimit-reset": "1764000000000" });
  assert.equal(day.status, 429);
  assert.equal(day.rateKind, "day");
  assert.equal(day.retryAfterSec, null);
  const minute = await run({ error: { message: "Rate limit exceeded: free-models-per-min." } }, { "x-ratelimit-reset": "1764000000000" });
  assert.equal(minute.rateKind, "minute");
  assert.equal(minute.retryAfterSec, null);
  assert.equal((await run({ error: { message: "slow" } }, { "retry-after": "12" })).retryAfterSec, 12);
});

test("an sk-or key never appears in an error message or a redacted text", async () => {
  const error = await callOpenrouter(body(), { apiKey: KEY, fetchImpl: async () => reply(401, { error: { message: `bad key ${KEY}` } }) }).catch((e) => e);
  assert.doesNotMatch(error.message, /sk-or-/);
  // a key of another shape in a text is hidden too
  assert.doesNotMatch(redact(`x sk-or-v1-${"a".repeat(30)} y`, ""), /sk-or-/);
  const net = await callOpenrouter(body(), { apiKey: KEY, fetchImpl: async () => { throw new Error(`down ${KEY}`); } }).catch((e) => e);
  assert.doesNotMatch(net.message, /sk-or-/);
});

test("the list of models is read without a key when none is given", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, init });
    return reply(200, { data: [{ id: "a/b:free" }, { id: "c/d" }] });
  };
  assert.deepEqual(await listOpenrouterModels({ fetchImpl }), ["a/b:free", "c/d"]);
  assert.equal(seen[0].url, "https://openrouter.ai/api/v1/models");
  assert.equal(seen[0].init.headers.authorization, undefined);
  await listOpenrouterModels({ apiKey: KEY, fetchImpl });
  assert.equal(seen[1].init.headers.authorization, `Bearer ${KEY}`);
});

test("there is a call for OpenRouter among the provider calls", () => {
  assert.ok(PROVIDER_IDS.includes("openrouter"));
  const mine = async () => {};
  assert.equal(providerCalls({ callOpenrouter: mine }).openrouter, mine);
  assert.equal(typeof providerCalls({}).openrouter, "function");
});

const design = (extra = {}) => ({
  pattern: "sequential",
  nodes: [
    { id: "planner", agent: "planner", model: "fast", slot: "openrouter-free", search: false, ...extra },
    { id: "writer", agent: "writer", model: "strong", slot: "openrouter-free", search: false },
  ],
  edges: [{ from: "planner", to: "writer" }],
});
const res = () => ({ statusCode: 0, headers: {}, chunks: [], setHeader() {}, flushHeaders() {}, write(c) { this.chunks.push(String(c)); return true; }, end(c) { if (c) this.chunks.push(String(c)); }, on() {}, get text() { return this.chunks.join(""); } });

test("a run sends each agent the id of its slot, and the strong free model is not forced into a format", async () => {
  const seen = [];
  const handler = createRunHandler({ callOpenrouter: (b, options) => { seen.push({ model: b.model, forcedFormat: options.forcedFormat }); return createMockCall()(b, options); }, rateLimitImpl: () => true, env: {} });
  const r = res();
  await handler({ method: "POST", headers: {}, body: { design: design(), task: "Why is the sky blue?", limits: {}, language: "en", keys: { "openrouter-free": KEY } } }, r);
  assert.equal(r.statusCode, 200);
  assert.ok(seen.some((s) => s.model === "google/gemma-4-26b-a4b-it:free" && s.forcedFormat === true));
  assert.ok(seen.some((s) => s.model === "nvidia/nemotron-3-ultra-550b-a55b:free" && s.forcedFormat === false));
  assert.ok(!r.text.includes(KEY));
});

test("a student-chosen id for a vanished free model is used and sent", async () => {
  const seen = [];
  const handler = createRunHandler({ callOpenrouter: (b, options) => { seen.push(b.model); return createMockCall()(b, options); }, rateLimitImpl: () => true, env: {} });
  const r = res();
  await handler({ method: "POST", headers: {}, body: { design: design({ modelId: "meta-llama/llama-4-scout:free" }), task: "Hi", limits: {}, language: "en", keys: { "openrouter-free": KEY } } }, r);
  assert.equal(r.statusCode, 200);
  assert.ok(seen.includes("meta-llama/llama-4-scout:free"));
});

test("a design with a bad modelId is refused", async () => {
  const bad = ["../x", "x".repeat(300), "deepseek/deepseek-v4-flash", 7, ""];
  for (const modelId of bad) {
    const checked = validateDesign(design({ modelId }));
    assert.equal(checked.ok, false, String(modelId));
    assert.ok(checked.errors.some((e) => e.code === "node.modelId"));
    const handler = createRunHandler({ callOpenrouter: createMockCall(), rateLimitImpl: () => true, env: {} });
    const r = res();
    await handler({ method: "POST", headers: {}, body: { design: design({ modelId }), task: "Hi", limits: {}, language: "en", keys: { "openrouter-free": KEY } } }, r);
    assert.equal(r.statusCode, 400, String(modelId));
  }
  // an override on the paid slot, or on another provider, is refused as well
  const paid = design({ modelId: "meta-llama/llama-4-scout:free" });
  paid.nodes[0].slot = "openrouter";
  assert.equal(validateDesign(paid).ok, false);
  const groq = design({ modelId: "meta-llama/llama-4-scout:free" });
  groq.nodes[0].slot = "groq-free";
  assert.equal(validateDesign(groq).ok, false);
  assert.equal(validateDesign(design({ modelId: "meta-llama/llama-4-scout:free" })).ok, true);
});

test("the models route lists OpenRouter without a key and still needs one for the others", async () => {
  const lists = { openrouter: async ({ apiKey }) => (apiKey ? ["a/b:free"] : ["a/b:free", "c/d:free"]), groq: async () => ["x"] };
  const handler = createModelsHandler({ lists, rateLimitImpl: () => true });
  const ask = async (payload) => {
    const r = res();
    await handler({ method: "POST", headers: {}, body: payload }, r);
    return { status: r.statusCode, data: JSON.parse(r.text) };
  };
  const open = await ask({ provider: "openrouter" });
  assert.equal(open.status, 200);
  assert.equal(open.data.ok, true);
  assert.equal((await ask({ provider: "openrouter", key: "" })).status, 200);
  assert.equal((await ask({ provider: "openrouter", key: "short" })).data.error, "bad_key");
  assert.equal((await ask({ provider: "groq" })).data.error, "bad_key");
});
