import { test } from "node:test";
import assert from "node:assert/strict";
import { callsOf } from "../public/js/engine/estimate.js";
import { limitFindings, limitOffers } from "../public/js/engine/limits.js";
import { toChatRequest } from "../public/js/engine/openai-compat.js";
import { createGate } from "../public/js/engine/pacing.js";
import { TIME_LIMIT_MS } from "../public/js/engine/budget.js";

const LIMITS = { maxSteps: 60, maxTokens: 150000, maxSearches: 3 };
const n = (id, extra = {}) => ({ id, agent: "writer", model: "fast", search: false, slot: "groq-free", ...extra });
const join = (extra = {}) => ({ pattern: "parallel", nodes: [n("p0"), n("p1"), n("p2"), n("w", extra)], edges: [{ from: "p0", to: "w" }, { from: "p1", to: "w" }, { from: "p2", to: "w" }] });
const settings = { outputTokens: 4000, handoffChars: 0 };

test("an agent's own lower answer limit lowers the estimate and clears the block", () => {
  const before = callsOf(join(), LIMITS, settings).find((r) => r.id === "w").perCallTokens;
  const after = callsOf(join({ limits: { maxOutputTokens: 1000 } }), LIMITS, settings).find((r) => r.id === "w").perCallTokens;
  assert.equal(before - after, 3000);
  assert.equal(limitFindings({ design: join({ limits: { maxOutputTokens: 1000 } }), limits: LIMITS, ...settings }).some((f) => f.kind === "call-too-big"), false);
});

test("a forced reply format is sent without strict mode, so a schema with optional fields is not refused", () => {
  const request = toChatRequest({ model: "m", max_tokens: 10, system: "s", messages: [{ role: "user", content: "q" }], replySchema: { type: "object", properties: { a: { type: "string" } } } });
  assert.equal(request.response_format.json_schema.strict, false);
});

test("the run-slowly offer is made only when the run can finish inside the fixed run time", () => {
  for (const count of [8, 10, 12]) {
    const design = { pattern: "sequential", nodes: Array.from({ length: count }, (_, i) => n(`s${i}`)), edges: Array.from({ length: count - 1 }, (_, i) => ({ from: `s${i}`, to: `s${i + 1}` })) };
    const slow = limitFindings({ design, limits: LIMITS, ...settings }).find((f) => f.kind === "slow");
    if (!slow) continue;
    const offered = limitOffers({ design, limits: LIMITS, ...settings, loadedSlots: ["groq-free"] }).some((o) => o.id === "slowly");
    assert.equal(offered, slow.numbers.minutes * 60000 <= TIME_LIMIT_MS, `${count} agents, ${slow.numbers.minutes} min`);
  }
});

test("moving an agent to a free Gemini slot gives it a model that slot offers", () => {
  const design = join({ model: "strong" });
  design.nodes = design.nodes.map((x) => (x.id === "w" ? { ...x, limits: undefined } : x));
  const move = limitOffers({ design, limits: LIMITS, ...settings, loadedSlots: ["groq-free", "google-free"] }).find((o) => o.id === "move-agent");
  const moved = move.apply(design, settings).design.nodes.find((x) => x.id === "w");
  assert.equal(moved.slot, "google-free");
  assert.notEqual(moved.model, "strong");
});

test("a gate runs calls one at a time with a gap between them", async () => {
  const sleeps = [];
  const gate = createGate({ gapMs: 2000, sleep: async (ms) => sleeps.push(ms) });
  let running = 0;
  let peak = 0;
  const call = async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 5));
    running -= 1;
    return "ok";
  };
  assert.deepEqual(await Promise.all([gate.run(call), gate.run(call), gate.run(call)]), ["ok", "ok", "ok"]);
  assert.equal(peak, 1);
  assert.deepEqual(sleeps, [2000, 2000]);
});

test("a failing call does not block the calls behind it", async () => {
  const gate = createGate({ gapMs: 0, sleep: async () => {} });
  await assert.rejects(gate.run(async () => { throw new Error("x"); }));
  assert.equal(await gate.run(async () => "next"), "next");
});
