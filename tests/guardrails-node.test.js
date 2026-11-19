import test from "node:test";
import assert from "node:assert/strict";
import { validateDesign } from "../public/js/engine/patterns.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const GR = [{ where: "output", kind: "secret", onFail: "repair" }];

test("validateDesign: guardrails only where an agent may have them", () => {
  const ok = { pattern: "sequential", nodes: [node("writer", "writer", { guardrails: GR })], edges: [] };
  assert.equal(validateDesign(ok).ok, true);
  const sup = { pattern: "supervisor", nodes: [node("supervisor", "supervisor", { guardrails: GR }), node("writer", "writer")], edges: [{ from: "supervisor", to: "writer" }] };
  assert.ok(validateDesign(sup).errors.some((e) => e.code === "node.guardrails"));
  const hand = { pattern: "handoff", start: "writer", nodes: [node("writer", "writer", { guardrails: GR }), node("critic", "critic")], edges: [{ from: "writer", to: "critic" }] };
  assert.ok(validateDesign(hand).errors.some((e) => e.code === "node.guardrails"));
});

test("validateDesign: four guardrails or repair on an input are refused", () => {
  const four = { pattern: "sequential", nodes: [node("writer", "writer", { guardrails: [...GR, ...GR, ...GR, ...GR] })], edges: [] };
  assert.ok(validateDesign(four).errors.some((e) => e.code === "node.guardrails"));
  const input = { pattern: "sequential", nodes: [node("writer", "writer", { guardrails: [{ where: "input", kind: "secret", onFail: "repair" }] })], edges: [] };
  assert.ok(validateDesign(input).errors.some((e) => e.code === "node.guardrails"));
});
