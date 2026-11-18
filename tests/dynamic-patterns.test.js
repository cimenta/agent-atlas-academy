import test from "node:test";
import assert from "node:assert/strict";
import { validateDesign, PATTERNS } from "../public/js/engine/patterns.js";
import { AGENT_TYPES } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const edge = (from, to) => ({ from, to });
const codes = (r) => r.errors.map((e) => e.code);

const mapDesign = (extra = {}) => ({
  pattern: "mapreduce",
  nodes: [node("splitter", "splitter"), node("worker", "worker"), node("reducer", "reducer")],
  edges: [edge("splitter", "worker"), edge("worker", "reducer")],
  ...extra,
});
const planDesign = (extra = {}) => ({
  pattern: "planexec",
  nodes: [node("planner", "planner"), node("executor", "executor")],
  edges: [edge("planner", "executor")],
  ...extra,
});

test("the two new patterns exist and their agent types belong to them alone", () => {
  assert.ok(PATTERNS.includes("mapreduce") && PATTERNS.includes("planexec"));
  assert.deepEqual(AGENT_TYPES.splitter.patterns, ["mapreduce"]);
  assert.deepEqual(AGENT_TYPES.worker.patterns, ["mapreduce"]);
  assert.deepEqual(AGENT_TYPES.reducer.patterns, ["mapreduce"]);
  assert.deepEqual(AGENT_TYPES.executor.patterns, ["planexec"]);
  assert.ok(AGENT_TYPES.planner.patterns.includes("planexec"));
  assert.ok(!AGENT_TYPES.researcher.patterns.includes("planexec") && !AGENT_TYPES.writer.patterns.includes("mapreduce"));
});

test("map-reduce: splitter, worker and reducer in a line is valid", () => {
  assert.deepEqual(validateDesign(mapDesign()), { ok: true, errors: [] });
});

test("map-reduce: other node counts give map.nodes", () => {
  assert.ok(codes(validateDesign(mapDesign({ nodes: [node("splitter", "splitter"), node("worker", "worker")], edges: [edge("splitter", "worker")] }))).includes("map.nodes"));
  const two = mapDesign({ nodes: [node("splitter", "splitter"), node("worker", "worker"), node("w2", "worker"), node("reducer", "reducer")], edges: [edge("splitter", "worker"), edge("worker", "reducer")] });
  assert.ok(codes(validateDesign(two)).includes("map.nodes"));
  const noReducer = mapDesign({ nodes: [node("splitter", "splitter"), node("worker", "worker"), node("w2", "worker")] });
  assert.ok(codes(validateDesign(noReducer)).includes("map.nodes"));
});

test("map-reduce: the arrows must be splitter to worker and worker to reducer, nothing else", () => {
  assert.ok(codes(validateDesign(mapDesign({ edges: [edge("splitter", "worker")] }))).includes("map.edges"));
  assert.ok(codes(validateDesign(mapDesign({ edges: [edge("worker", "splitter"), edge("worker", "reducer")] }))).includes("map.edges"));
  assert.ok(codes(validateDesign(mapDesign({ edges: [edge("splitter", "worker"), edge("worker", "reducer"), edge("splitter", "reducer")] }))).includes("map.edges"));
});

test("plan-and-execute: planner and executor with one arrow is valid", () => {
  assert.deepEqual(validateDesign(planDesign()), { ok: true, errors: [] });
});

test("plan-and-execute: other node counts give plan.nodes, other arrows give plan.edges", () => {
  assert.ok(codes(validateDesign(planDesign({ nodes: [node("planner", "planner")], edges: [] }))).includes("plan.nodes"));
  assert.ok(codes(validateDesign(planDesign({ nodes: [node("planner", "planner"), node("executor", "executor"), node("e2", "executor")], edges: [edge("planner", "executor")] }))).includes("plan.nodes"));
  assert.ok(codes(validateDesign(planDesign({ nodes: [node("planner", "planner"), node("p2", "planner")], edges: [edge("planner", "p2")] }))).includes("plan.nodes"));
  assert.ok(codes(validateDesign(planDesign({ edges: [] }))).includes("plan.edges"));
  assert.ok(codes(validateDesign(planDesign({ edges: [edge("executor", "planner")] }))).includes("plan.edges"));
});

test("the new types are not allowed in the other patterns", () => {
  const seq = { pattern: "sequential", nodes: [node("a", "worker"), node("b", "writer")], edges: [edge("a", "b")] };
  assert.ok(codes(validateDesign(seq)).includes("node.agentNotAllowed"));
  const seq2 = { pattern: "sequential", nodes: [node("a", "executor"), node("b", "writer")], edges: [edge("a", "b")] };
  assert.ok(codes(validateDesign(seq2)).includes("node.agentNotAllowed"));
  const plan = planDesign({ nodes: [node("planner", "writer"), node("executor", "executor")] });
  assert.ok(codes(validateDesign(plan)).includes("plan.nodes") || codes(validateDesign(plan)).includes("node.agentNotAllowed"));
});
