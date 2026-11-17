import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { OUTPUT_TOKENS, clampOutputTokens, NODE_MAX, TASK_MAX_CHARS, MAX_PAUSES, REQUEST_MAX_BYTES, RESUME_MAX_BYTES, DEFAULT_RUNS_PER_HOUR, LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { TIME_LIMIT_MS } from "../public/js/engine/budget.js";
import { fixedRules, limitMessage } from "../public/js/engine/harness.js";
import { createAgent } from "../public/js/engine/agent.js";
import { createBudget } from "../public/js/engine/budget.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { createRunHandler } from "../lib/run-handler.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

const memory = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
};

test("the output token choice is clamped to 1000 to 4000 and defaults to 4000", () => {
  assert.deepEqual(OUTPUT_TOKENS, { min: 1000, max: 4000, step: 500, default: 4000 });
  assert.equal(clampOutputTokens(500), 1000);
  assert.equal(clampOutputTokens(99999), 4000);
  assert.equal(clampOutputTokens(2500), 2500);
  assert.equal(clampOutputTokens("x"), 4000);
  assert.equal(clampOutputTokens(undefined), 4000);
});

test("the settings keep the output token choice and clamp it", () => {
  const store = createSettingsStore(memory());
  assert.equal(store.get().maxOutputTokens, 4000);
  store.setMaxOutputTokens(2000);
  assert.equal(store.get().maxOutputTokens, 2000);
  store.setMaxOutputTokens(99999);
  assert.equal(store.get().maxOutputTokens, 4000);
  store.setMaxOutputTokens(10);
  assert.equal(store.get().maxOutputTokens, 1000);
});

test("an agent caps one reply at the chosen output tokens", async () => {
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    return { content: [{ type: "text", text: "x" }], stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } };
  };
  const agent = createAgent({ node: { id: "critic", agent: "critic", model: "fast", search: false }, call, emit: () => {}, budget: createBudget(LIMIT_DEFAULTS), maxOutputTokens: 1500 });
  await agent.run("t");
  assert.equal(calls[0].max_tokens, 1500);
});

const chain = () => ({
  pattern: "sequential",
  nodes: ["planner", "researcher", "writer"].map((id) => ({ id, agent: id, model: "fast", search: false })),
  edges: [{ from: "planner", to: "researcher" }, { from: "researcher", to: "writer" }],
});
const answer = async () => ({ content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });

test("a run passes the output token choice to every request", async () => {
  const sizes = [];
  const call = async (body) => {
    sizes.push(body.max_tokens);
    return answer();
  };
  await runDesign({ design: chain(), task: "t", limits: LIMIT_DEFAULTS, call, emit: () => {}, maxOutputTokens: 1200 });
  assert.deepEqual(sizes, [1200, 1200, 1200]);
});

test("a limit that stops a run is recorded as a warning right before done", async () => {
  const events = [];
  const limits = { ...LIMIT_DEFAULTS, maxSteps: 2 };
  await runDesign({ design: chain(), task: "t", limits, call: answer, emit: (e) => events.push(e) });
  const types = events.map((e) => e.type);
  const warning = events.find((e) => e.type === "warning" && e.limit === "steps");
  assert.ok(warning, "a warning with the limit reason");
  assert.equal(warning.message, limitMessage("steps", limits));
  assert.equal(types.at(-1), "done");
  assert.equal(types.at(-2), "warning");
});

test("a run that finishes has no limit warning", async () => {
  const events = [];
  await runDesign({ design: chain(), task: "t", limits: LIMIT_DEFAULTS, call: answer, emit: (e) => events.push(e) });
  assert.equal(events.some((e) => e.limit), false);
});

test("the limit message names the limit and its value", () => {
  assert.match(limitMessage("steps", { maxSteps: 20, maxTokens: 40000, maxSearches: 3 }), /steps.*20/i);
  assert.match(limitMessage("tokens", { maxSteps: 20, maxTokens: 40000, maxSearches: 3 }), /tokens.*40000/i);
  assert.match(limitMessage("searches", { maxSteps: 20, maxTokens: 40000, maxSearches: 3 }), /searches.*3/i);
  assert.match(limitMessage("time", LIMIT_DEFAULTS), /270/);
});

test("the fixed rules read the real constants", () => {
  assert.equal(NODE_MAX, 8);
  const rules = Object.fromEntries(fixedRules().map((r) => [r.id, r.params]));
  assert.deepEqual(Object.keys(rules), ["time", "agents", "task", "request", "pauses", "rate", "keys"]);
  assert.equal(rules.time.n, TIME_LIMIT_MS / 1000);
  assert.equal(rules.agents.n, NODE_MAX);
  assert.equal(rules.task.n, TASK_MAX_CHARS);
  assert.deepEqual(rules.request, { a: REQUEST_MAX_BYTES / 1024, b: RESUME_MAX_BYTES / 1024 });
  assert.equal(rules.pauses.n, MAX_PAUSES);
  assert.equal(rules.rate.n, DEFAULT_RUNS_PER_HOUR);
});

test("every fixed rule has a label, a hint and a value in both languages", () => {
  for (const { id } of fixedRules()) {
    for (const part of ["label", "hint", "value"]) {
      assert.ok(en[`harness.fixed.${id}.${part}`], `en ${id} ${part}`);
      assert.ok(cs[`harness.fixed.${id}.${part}`], `cs ${id} ${part}`);
    }
  }
});

test("the server clamps the output tokens it is sent", async () => {
  const sizes = [];
  const call = async (body) => {
    sizes.push(body.max_tokens);
    return answer();
  };
  const handler = createRunHandler({ call, rateLimitImpl: () => true, env: {} });
  const res = { statusCode: 0, headers: {}, chunks: [], setHeader() {}, flushHeaders() {}, write(c) { this.chunks.push(c); return true; }, end() {}, on() {} };
  const body = { design: chain(), task: "Why?", limits: {}, language: "en", apiKey: "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX", outputTokens: 99999 };
  await handler({ method: "POST", headers: {}, body }, res);
  assert.ok(sizes.length > 0);
  assert.ok(sizes.every((n) => n === 4000));
  sizes.length = 0;
  await handler({ method: "POST", headers: {}, body: { ...body, outputTokens: 1500 } }, { ...res, chunks: [] });
  assert.ok(sizes.every((n) => n === 1500));
});
