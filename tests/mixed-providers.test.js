import { test } from "node:test";
import assert from "node:assert/strict";
import { createRunHandler } from "../lib/run-handler.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { createEditor } from "../public/js/create/editor-model.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { estimateRun } from "../public/js/engine/estimate.js";
import { buildRunRecord, modelsUsed } from "../public/js/engine/run-record.js";
import { DEFAULT_PROVIDER_COLORS, mergeProviderColors, modelTagColors } from "../public/js/provider-colors.js";
import { createSettingsStore } from "../public/js/storage/settings.js";

const ANT = "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX";
const GOO = "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
const mixed = () => ({
  pattern: "sequential",
  nodes: [
    { id: "planner", agent: "planner", model: "fast", slot: "anthropic", search: false },
    { id: "writer", agent: "writer", model: "balanced", slot: "google", search: false },
  ],
  edges: [{ from: "planner", to: "writer" }],
});

test("a design may name a key slot for each agent, and only a real one", () => {
  assert.equal(validateDesign(mixed()).ok, true);
  const bad = mixed();
  bad.nodes[0].slot = "nope";
  assert.deepEqual(validateDesign(bad).errors.map((e) => e.code), ["node.slot"]);
});

test("the server sends each agent to the provider and key of its slot", async () => {
  const seen = [];
  const fake = (name) => async (body, { apiKey }) => {
    seen.push({ name, apiKey, model: body.model });
    return createMockCall()(body, { apiKey });
  };
  const handler = createRunHandler({ call: fake("anthropic"), callGoogle: fake("google"), rateLimitImpl: () => true, env: {} });
  const res = { statusCode: 0, headers: {}, chunks: [], setHeader() {}, flushHeaders() {}, write(c) { this.chunks.push(String(c)); return true; }, end() {}, on() {}, get text() { return this.chunks.join(""); } };
  await handler({ method: "POST", headers: {}, body: { design: mixed(), task: "Why is the sky blue?", limits: {}, language: "en", keys: { anthropic: ANT, google: GOO } } }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(seen.map((s) => [s.name, s.apiKey]).sort(), [["anthropic", ANT], ["google", GOO]]);
  assert.ok(!res.text.includes(GOO) && !res.text.includes(ANT));
});

test("the server refuses a run when an agent's slot has no key", async () => {
  const handler = createRunHandler({ rateLimitImpl: () => true, env: {} });
  const res = { statusCode: 0, headers: {}, chunks: [], setHeader() {}, flushHeaders() {}, write() {}, end(c) { this.chunks.push(String(c)); }, on() {} };
  await handler({ method: "POST", headers: {}, body: { design: mixed(), task: "Hi", keys: { anthropic: ANT } } }, res);
  assert.equal(res.statusCode, 400);
});

test("a mixed run is priced, named and recorded by every provider it uses", () => {
  const d = mixed();
  assert.equal(modelsUsed(d), "claude-haiku-5-5, gemini-3.8-flash");
  const alone = estimateRun({ ...d, nodes: d.nodes.map((n) => ({ ...n, slot: "anthropic" })) }, {});
  assert.notEqual(estimateRun(d, {}).costUsd, alone.costUsd);
  const record = buildRunRecord({ id: "local-x", design: d, task: "t", events: [], limits: {}, language: "en", appVersion: "t", provider: "anthropic" });
  assert.equal(record.recordedWith.provider, "anthropic+google");
});

test("the default model goes to every agent that has no model of its own", () => {
  const e = createEditor("sequential");
  e.setDefaultModel({ slot: "anthropic", model: "fast" });
  e.addNode("planner");
  e.addNode("writer");
  e.setNodeModel("writer", { slot: "google", model: "strong" });
  e.setDefaultModel({ slot: "google-free", model: "balanced" });
  const [planner, writer] = e.design().nodes;
  assert.deepEqual([planner.slot, planner.model], ["google-free", "balanced"]);
  assert.deepEqual([writer.slot, writer.model, writer.custom], ["google", "strong", true]);
  e.setNodeModel("writer", null);
  assert.deepEqual([e.design().nodes[1].slot, e.design().nodes[1].custom], ["google-free", undefined]);
});

test("an agent whose provider is no longer chosen goes back to the default", () => {
  const e = createEditor("sequential");
  e.setDefaultModel({ slot: "anthropic", model: "fast" });
  e.addNode("planner");
  e.setNodeModel("planner", { slot: "google", model: "strong" });
  e.keepSlots((node) => node.slot === "anthropic");
  assert.deepEqual([e.design().nodes[0].slot, e.design().nodes[0].custom], ["anthropic", undefined]);
});

test("a model tag takes the provider color; a stronger model is darker, another provider differs", () => {
  const colors = mergeProviderColors({ anthropic: "#d97757", google: "#4285f4", junk: "x" });
  const fast = modelTagColors("claude-haiku-5-5", colors).background;
  const mid = modelTagColors("claude-sonnet-5-5", colors).background;
  const strong = modelTagColors("claude-opus-5-5", colors).background;
  assert.equal(mid, "#d97757");
  assert.equal(new Set([fast, mid, strong]).size, 3);
  const sum = (hex) => [1, 3, 5].reduce((n, i) => n + parseInt(hex.slice(i, i + 2), 16), 0);
  assert.ok(sum(fast) > sum(mid) && sum(mid) > sum(strong));
  assert.notEqual(modelTagColors("gemini-3.8-flash", colors).background, mid);
  assert.equal(modelTagColors("unknown-model", colors), null);
});

test("the color of a provider is a setting that survives and rejects bad values", () => {
  const map = new Map();
  const store = createSettingsStore({ getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, v), removeItem: (k) => map.delete(k) });
  assert.deepEqual(store.get().providerColors, DEFAULT_PROVIDER_COLORS);
  store.setProviderColor("google", "#112233");
  store.setProviderColor("anthropic", "red");
  store.setProviderColor("nope", "#112233");
  assert.deepEqual(store.get().providerColors, { anthropic: DEFAULT_PROVIDER_COLORS.anthropic, google: "#112233" });
});
