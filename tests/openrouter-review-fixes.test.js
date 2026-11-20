import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetryChoice } from "../public/js/replay/retry-choice.js";
import { nodeModel } from "../public/js/engine/catalog.js";
import { limitFindings, limitOffers } from "../public/js/engine/limits.js";
import { createRunHandler } from "../lib/run-handler.js";

const PICK = "z/picked:free";
const LIMITS = { maxSteps: 90, maxTokens: 400000, maxSearches: 3 };

test("review 1: a retry that changes the model drops the picked id, one that keeps the same model keeps it", () => {
  const run = { design: { pattern: "sequential", nodes: [{ id: "a", agent: "writer", model: "strong", slot: "openrouter-free", modelId: PICK }], edges: [] }, events: [] };
  const other = withRetryChoice(run, "a", { slot: "openrouter-free", model: "balanced" });
  assert.equal(other.design.nodes[0].modelId, undefined);
  assert.equal(nodeModel(other.design.nodes[0]).id, "google/gemma-4-31b-it:free");
  const away = withRetryChoice(run, "a", { slot: "groq-free", model: "fast" });
  assert.equal("modelId" in away.design.nodes[0], false);
  const same = withRetryChoice(run, "a", { slot: "openrouter-free", model: "strong" });
  assert.equal(same.design.nodes[0].modelId, PICK);
});

test("review 2: a reviewer or condense call for another tier does not use the picked id, and a picked id sends no forced format", () => {
  const node = { id: "a", agent: "writer", model: "strong", slot: "openrouter-free", modelId: PICK };
  assert.equal(nodeModel(node).id, PICK);
  assert.equal(nodeModel({ ...node, model: "fast" }).forcedFormat, false);
  assert.equal(nodeModel({ ...node, model: "fast", modelId: undefined }).id, "google/gemma-4-26b-a4b-it:free");
});

test("review 2: the server asks the provider for the forced format by the model of each call", async () => {
  const seen = [];
  const handler = createRunHandler({ callOpenrouter: async (body, options) => { seen.push({ model: body.model, forcedFormat: options.forcedFormat }); return { content: [{ type: "text", text: "ok" }], usage: { input_tokens: 1, output_tokens: 1 } }; }, rateLimitImpl: () => true });
  assert.equal(typeof handler, "function");
  const { forcedFormatFor } = await import("../lib/run-handler.js");
  assert.equal(typeof forcedFormatFor, "function");
  const node = { id: "a", agent: "writer", model: "fast", slot: "openrouter-free" };
  assert.equal(forcedFormatFor(node, "google/gemma-4-26b-a4b-it:free"), true);
  assert.equal(forcedFormatFor(node, "nvidia/nemotron-3-ultra-550b-a55b:free"), false);
  assert.equal(forcedFormatFor({ ...node, model: "strong", modelId: PICK }, PICK), false);
});

const mixed = () => {
  const nodes = [{ id: "g", agent: "writer", model: "fast", search: false, slot: "groq-free" }, ...Array.from({ length: 60 }, (_, i) => ({ id: "o" + i, agent: "writer", model: "fast", search: false, slot: "openrouter-free" }))];
  return { pattern: "sequential", nodes, edges: nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id })) };
};

test("review 3: a mixed design offers only what helps the limit that is hit, and the paid key moves only that account's agents", () => {
  const design = mixed();
  const findings = limitFindings({ design, limits: LIMITS });
  const hit = findings.find((f) => f.kind === "day-requests");
  assert.ok(hit, "the fixture hits the OpenRouter day limit");
  assert.ok(hit.agents.every((id) => id !== "g"));
  const offers = limitOffers({ design, limits: LIMITS, loadedSlots: ["groq", "openrouter", "groq-free", "openrouter-free"] });
  const ids = offers.map((o) => o.id);
  assert.ok(!ids.includes("shorter"), "shorter answers do not help a requests limit");
  const paid = offers.find((o) => o.id === "paid-key");
  assert.equal(paid.slot, "openrouter");
  assert.ok(!paid.agents.includes("g"));
});
