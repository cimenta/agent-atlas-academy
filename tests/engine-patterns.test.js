import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDesign, orderOf, clampLimits, parallelParts, PATTERNS } from "../public/js/engine/patterns.js";
import { LIMIT_DEFAULTS, LIMIT_MAX, NODE_MAX, MODELS, AGENT_TYPES, CRITERIA_MAX } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const edge = (from, to) => ({ from, to });
const codes = (result) => result.errors.map((e) => e.code);

const sequential = () => ({
  pattern: "sequential",
  nodes: [node("planner", "planner"), node("researcher", "researcher"), node("critic", "critic"), node("writer", "writer")],
  edges: [edge("planner", "researcher"), edge("researcher", "critic"), edge("critic", "writer")],
});
const parallel = () => ({
  pattern: "parallel",
  nodes: [node("researcher", "researcher"), node("researcher-2", "researcher"), node("combiner", "combiner")],
  edges: [edge("researcher", "combiner"), edge("researcher-2", "combiner")],
});
const supervisor = () => ({
  pattern: "supervisor",
  nodes: [node("supervisor", "supervisor"), node("researcher", "researcher"), node("writer", "writer")],
  edges: [edge("supervisor", "researcher"), edge("supervisor", "writer")],
});
const debate = () => ({
  pattern: "debate",
  nodes: [node("debater", "debater", { stance: "for" }), node("debater-2", "debater", { stance: "against" }), node("judge", "judge")],
  edges: [edge("debater", "judge"), edge("debater-2", "judge")],
  rounds: 2,
});

test("the catalog lists eight patterns, three models and the agent types", () => {
  assert.deepEqual(PATTERNS, ["sequential", "parallel", "supervisor", "debate", "evaluator", "handoff", "router", "voting"]);
  assert.deepEqual(MODELS.map((m) => m.key), ["fast", "balanced", "strong"]);
  for (const key of ["planner", "researcher", "critic", "writer", "supervisor", "combiner", "debater", "judge", "evaluator", "router", "tally", "free"]) {
    assert.ok(AGENT_TYPES[key], key);
  }
});

for (const [name, make] of [["sequential", sequential], ["parallel", parallel], ["supervisor", supervisor], ["debate", debate]]) {
  test(`a valid ${name} design passes`, () => {
    const result = validateDesign(make());
    assert.deepEqual(result.errors, []);
    assert.equal(result.ok, true);
  });
}

test("the same agent type may appear twice in a chain", () => {
  const d = sequential();
  d.nodes.push(node("critic-2", "critic"));
  d.edges.push(edge("writer", "critic-2"));
  assert.equal(validateDesign(d).ok, true);
});

test("shape errors: not an object, bad pattern, bad lists", () => {
  for (const bad of [null, "x", [], 5, undefined]) assert.deepEqual(codes(validateDesign(bad)), ["design.shape"]);
  assert.ok(codes(validateDesign({ ...sequential(), pattern: "swarm" })).includes("design.shape"));
  assert.ok(codes(validateDesign({ pattern: "sequential", nodes: "no", edges: [] })).includes("design.shape"));
  assert.ok(codes(validateDesign({ pattern: "sequential", nodes: [], edges: {} })).includes("design.shape"));
});

test("node count: none, or more than the maximum", () => {
  assert.ok(codes(validateDesign({ pattern: "sequential", nodes: [], edges: [] })).includes("node.count"));
  const big = { pattern: "sequential", nodes: Array.from({ length: 500 }, (_, i) => node(`critic-${i}`, "critic")), edges: [] };
  const started = Date.now();
  const result = validateDesign(big);
  assert.ok(Date.now() - started < 200);
  assert.ok(codes(result).includes("node.count"));
  assert.equal(NODE_MAX, 8);
});

test("node field errors", () => {
  const withNode = (patch) => {
    const d = sequential();
    d.nodes[0] = { ...d.nodes[0], ...patch };
    return d;
  };
  assert.ok(codes(validateDesign(withNode({ id: "Bad Id!" }))).includes("node.id"));
  assert.ok(codes(validateDesign(withNode({ id: "x".repeat(33) }))).includes("node.id"));
  assert.ok(codes(validateDesign(withNode({ agent: "wizard" }))).includes("node.agent"));
  assert.ok(codes(validateDesign(withNode({ model: "gpt-4" }))).includes("node.model"));
  assert.ok(codes(validateDesign(withNode({ name: "n".repeat(41), agent: "free" }))).includes("node.name"));
  assert.ok(codes(validateDesign(withNode({ agent: "free", instructions: "i".repeat(100000) }))).includes("node.instructions"));
  assert.ok(codes(validateDesign(withNode({ instructions: "not allowed here" }))).includes("node.instructions"));
  assert.ok(codes(validateDesign(withNode({ search: "yes" }))).includes("node.search"));
  const dup = sequential();
  dup.nodes[1].id = "planner";
  assert.ok(codes(validateDesign(dup)).includes("node.duplicate"));
});

test("agent types not allowed in a pattern are refused", () => {
  const d = sequential();
  d.nodes[0] = node("combiner", "combiner");
  assert.ok(codes(validateDesign(d)).includes("node.agentNotAllowed"));
  const p = parallel();
  p.nodes.push(node("judge", "judge"));
  assert.ok(codes(validateDesign(p)).includes("node.agentNotAllowed"));
});

test("edge errors", () => {
  const d = sequential();
  d.edges.push(edge("planner", "ghost"));
  assert.ok(codes(validateDesign(d)).includes("edge.unknownNode"));
  const s = sequential();
  s.edges.push(edge("planner", "planner"));
  assert.ok(codes(validateDesign(s)).includes("edge.self"));
  const dup = sequential();
  dup.edges.push(edge("planner", "researcher"));
  assert.ok(codes(validateDesign(dup)).includes("edge.duplicate"));
  assert.ok(codes(validateDesign({ ...sequential(), edges: [null, "x", { from: 1, to: 2 }] })).includes("edge.unknownNode"));
});

test("sequential must be one chain", () => {
  const cycle = { pattern: "sequential", nodes: [node("planner", "planner"), node("critic", "critic")], edges: [edge("planner", "critic"), edge("critic", "planner")] };
  assert.ok(codes(validateDesign(cycle)).includes("seq.notChain"));
  const branch = sequential();
  branch.edges.push(edge("planner", "critic"));
  assert.ok(codes(validateDesign(branch)).includes("seq.notChain"));
  const gap = sequential();
  gap.edges = [edge("planner", "researcher"), edge("critic", "writer")];
  assert.ok(codes(validateDesign(gap)).includes("seq.notChain"));
  const single = { pattern: "sequential", nodes: [node("writer", "writer")], edges: [] };
  assert.equal(validateDesign(single).ok, true);
});

test("orderOf returns the chain order", () => {
  assert.deepEqual(orderOf(sequential()), ["planner", "researcher", "critic", "writer"]);
});

test("parallel rules", () => {
  const none = parallel();
  none.nodes = none.nodes.filter((n) => n.agent !== "combiner");
  none.edges = [];
  assert.ok(codes(validateDesign(none)).includes("par.combiner"));
  const two = parallel();
  two.nodes.push(node("combiner-2", "combiner"));
  assert.ok(codes(validateDesign(two)).includes("par.combiner"));
  const few = { pattern: "parallel", nodes: [node("researcher", "researcher"), node("combiner", "combiner")], edges: [edge("researcher", "combiner")] };
  assert.ok(codes(validateDesign(few)).includes("par.workers"));
  const missing = parallel();
  missing.edges = [edge("researcher", "combiner")];
  assert.ok(codes(validateDesign(missing)).includes("par.edges"));
  const extra = parallel();
  extra.edges.push(edge("researcher", "researcher-2"));
  assert.ok(codes(validateDesign(extra)).includes("par.edges"));
  const back = parallel();
  back.edges[0] = edge("combiner", "researcher");
  back.edges.push(edge("researcher", "combiner"));
  assert.ok(codes(validateDesign(back)).includes("par.edges"));
});

const followed = () => {
  const d = parallel();
  d.nodes.push(node("critic", "critic"), node("writer", "writer"));
  d.edges.push(edge("combiner", "critic"), edge("critic", "writer"));
  return d;
};

test("a parallel run may have a line of agents after the combiner", () => {
  assert.equal(validateDesign(followed()).ok, true);
  const parts = parallelParts(followed().nodes, followed().edges);
  assert.deepEqual(parts.workers.map((n) => n.id), ["researcher", "researcher-2"]);
  assert.deepEqual(parts.followers, ["critic", "writer"]);
});

test("the line after the combiner must be one line that starts at the combiner", () => {
  const forked = followed();
  forked.edges.push(edge("combiner", "writer"));
  assert.ok(codes(validateDesign(forked)).includes("par.edges"));
  const loose = followed();
  loose.edges = loose.edges.filter((e) => e.from !== "critic");
  assert.ok(codes(validateDesign(loose)).includes("par.edges"));
  const loop = followed();
  loop.edges.push(edge("writer", "combiner"));
  assert.ok(codes(validateDesign(loop)).includes("par.edges"));
  const fromWorker = followed();
  fromWorker.edges.push(edge("researcher", "critic"));
  assert.ok(codes(validateDesign(fromWorker)).includes("par.edges"));
});

test("supervisor rules", () => {
  const none = supervisor();
  none.nodes[0] = node("planner", "planner");
  none.edges = [edge("planner", "researcher"), edge("planner", "writer")];
  assert.ok(codes(validateDesign(none)).includes("sup.supervisor"));
  const alone = { pattern: "supervisor", nodes: [node("supervisor", "supervisor")], edges: [] };
  assert.ok(codes(validateDesign(alone)).includes("sup.workers"));
  const missing = supervisor();
  missing.edges = [edge("supervisor", "researcher")];
  assert.ok(codes(validateDesign(missing)).includes("sup.edges"));
  const cross = supervisor();
  cross.edges.push(edge("researcher", "writer"));
  assert.ok(codes(validateDesign(cross)).includes("sup.edges"));
});

test("debate rules", () => {
  const few = debate();
  few.nodes = few.nodes.filter((n) => n.id !== "debater-2");
  few.edges = [edge("debater", "judge")];
  assert.ok(codes(validateDesign(few)).includes("deb.debaters"));
  const noJudge = debate();
  noJudge.nodes = noJudge.nodes.filter((n) => n.agent !== "judge");
  noJudge.edges = [];
  assert.ok(codes(validateDesign(noJudge)).includes("deb.judge"));
  const missing = debate();
  missing.edges = [edge("debater", "judge")];
  assert.ok(codes(validateDesign(missing)).includes("deb.edges"));
  const cross = debate();
  cross.edges.push(edge("debater", "debater-2"));
  assert.ok(codes(validateDesign(cross)).includes("deb.edges"));
  for (const rounds of [0, 5, 1.5, "2", undefined]) {
    const d = debate();
    d.rounds = rounds;
    assert.ok(codes(validateDesign(d)).includes("deb.rounds"), String(rounds));
  }
});

test("clampLimits keeps safe values", () => {
  assert.deepEqual(clampLimits({ maxSteps: 9999, maxTokens: -5, maxSearches: "x" }), {
    maxSteps: LIMIT_MAX.maxSteps,
    maxTokens: LIMIT_DEFAULTS.maxTokens,
    maxSearches: LIMIT_DEFAULTS.maxSearches,
  });
  assert.deepEqual(clampLimits(undefined), LIMIT_DEFAULTS);
  assert.deepEqual(clampLimits({ maxSteps: 7, maxTokens: 1000, maxSearches: 0 }), { maxSteps: 7, maxTokens: 1000, maxSearches: 0 });
});

test("limit constants match the plan", () => {
  assert.deepEqual(LIMIT_DEFAULTS, { maxSteps: 20, maxTokens: 40000, maxSearches: 3 });
  assert.deepEqual(LIMIT_MAX, { maxSteps: 60, maxTokens: 150000, maxSearches: 10 });
});

test("addToPrevious is allowed only on a critic in a sequential or parallel design", () => {
  const seq = sequential();
  seq.nodes[2].addToPrevious = true;
  assert.equal(validateDesign(seq).ok, true);
  const notCritic = sequential();
  notCritic.nodes[3].addToPrevious = true;
  assert.deepEqual(codes(validateDesign(notCritic)), ["node.addToPrevious"]);
  const notBoolean = sequential();
  notBoolean.nodes[2].addToPrevious = "yes";
  assert.deepEqual(codes(validateDesign(notBoolean)), ["node.addToPrevious"]);
  const sup = supervisor();
  sup.nodes.push(node("critic", "critic", { addToPrevious: true }));
  sup.edges.push(edge("supervisor", "critic"));
  assert.deepEqual(codes(validateDesign(sup)), ["node.addToPrevious"]);
});

// ---- evaluator loop ----
const evaluatorDesign = (extra = {}) => ({
  pattern: "evaluator",
  nodes: [node("writer", "writer"), node("evaluator", "evaluator")],
  edges: [edge("writer", "evaluator")],
  rounds: 3,
  criteria: "x",
  ...extra,
});

test("evaluator design: one writer, one evaluator, one edge writer to evaluator is valid", () => {
  assert.deepEqual(validateDesign(evaluatorDesign()), { ok: true, errors: [] });
  assert.ok(PATTERNS.includes("evaluator"));
});

test("evaluator rounds 0, 5, 2.5 and missing give eval.rounds", () => {
  for (const rounds of [0, 5, 2.5, undefined]) {
    assert.ok(codes(validateDesign(evaluatorDesign({ rounds }))).includes("eval.rounds"), String(rounds));
  }
});

test("evaluator criteria: too long or not a string give eval.criteria, empty string is valid", () => {
  assert.ok(codes(validateDesign(evaluatorDesign({ criteria: "a".repeat(CRITERIA_MAX + 1) }))).includes("eval.criteria"));
  assert.ok(codes(validateDesign(evaluatorDesign({ criteria: 5 }))).includes("eval.criteria"));
  assert.ok(codes(validateDesign(evaluatorDesign({ criteria: undefined }))).includes("eval.criteria"));
  assert.equal(validateDesign(evaluatorDesign({ criteria: "" })).ok, true);
});

test("evaluator: two writers give eval.writer, no evaluator gives eval.evaluator", () => {
  const twoWriters = evaluatorDesign({ nodes: [node("writer", "writer"), node("writer-2", "writer"), node("evaluator", "evaluator")] });
  assert.ok(codes(validateDesign(twoWriters)).includes("eval.writer"));
  const none = evaluatorDesign({ nodes: [node("writer", "writer")], edges: [] });
  assert.ok(codes(validateDesign(none)).includes("eval.evaluator"));
});

test("evaluator edges: reversed, doubled or missing give eval.edges", () => {
  assert.ok(codes(validateDesign(evaluatorDesign({ edges: [edge("evaluator", "writer")] }))).includes("eval.edges"));
  assert.ok(codes(validateDesign(evaluatorDesign({ edges: [edge("writer", "evaluator"), edge("evaluator", "writer")] }))).includes("eval.edges"));
  assert.ok(codes(validateDesign(evaluatorDesign({ edges: [] }))).includes("eval.edges"));
});

test("agent types keep to their patterns for the evaluator loop", () => {
  const withCritic = evaluatorDesign({ nodes: [node("writer", "writer"), node("evaluator", "evaluator"), node("critic", "critic")] });
  assert.ok(codes(validateDesign(withCritic)).includes("node.agentNotAllowed"));
  const inSequential = { pattern: "sequential", nodes: [node("evaluator", "evaluator")], edges: [] };
  assert.ok(codes(validateDesign(inSequential)).includes("node.agentNotAllowed"));
});

// ---- handoff ----
const handoffDesign = (extra = {}) => ({
  pattern: "handoff",
  nodes: [node("planner", "planner"), node("researcher", "researcher"), node("writer", "writer")],
  edges: [edge("planner", "researcher"), edge("researcher", "writer")],
  start: "planner",
  ...extra,
});

test("handoff design with a start and arrows is valid", () => {
  assert.deepEqual(validateDesign(handoffDesign()), { ok: true, errors: [] });
  assert.ok(PATTERNS.includes("handoff"));
});

test("handoff: one agent gives hand.nodes", () => {
  const one = handoffDesign({ nodes: [node("planner", "planner")], edges: [] });
  assert.ok(codes(validateDesign(one)).includes("hand.nodes"));
});

test("handoff: a missing, non-string or unknown start gives hand.start", () => {
  for (const start of [undefined, 5, "nobody"]) assert.ok(codes(validateDesign(handoffDesign({ start }))).includes("hand.start"), String(start));
});

test("handoff: a start with no outgoing arrow gives hand.edges", () => {
  assert.ok(codes(validateDesign(handoffDesign({ start: "writer" }))).includes("hand.edges"));
});

test("handoff: cycles, arrows both ways and an unreachable agent are valid", () => {
  const both = handoffDesign({ edges: [edge("planner", "researcher"), edge("researcher", "planner"), edge("researcher", "writer"), edge("writer", "planner")] });
  assert.equal(validateDesign(both).ok, true);
  const lonely = handoffDesign({ edges: [edge("planner", "researcher")] });
  assert.equal(validateDesign(lonely).ok, true);
});

test("handoff: a self edge gives edge.self", () => {
  assert.ok(codes(validateDesign(handoffDesign({ edges: [edge("planner", "researcher"), edge("writer", "writer")] }))).includes("edge.self"));
});

test("handoff allows the general agent types and refuses the special ones", () => {
  for (const agent of ["planner", "researcher", "critic", "writer", "free"]) assert.ok(AGENT_TYPES[agent].patterns.includes("handoff"), agent);
  for (const agent of ["supervisor", "combiner", "debater", "judge", "evaluator"]) {
    const bad = handoffDesign({ nodes: [node("planner", "planner"), node("x", agent)], edges: [edge("planner", "x")] });
    assert.ok(codes(validateDesign(bad)).includes("node.agentNotAllowed"), agent);
  }
});

// ---- router ----
const routerDesign = (extra = {}) => ({
  pattern: "router",
  nodes: [node("router", "router"), node("writer", "writer"), node("researcher", "researcher")],
  edges: [edge("router", "writer"), edge("router", "researcher")],
  ...extra,
});

test("router design: one router and two specialists with an edge each is valid", () => {
  assert.deepEqual(validateDesign(routerDesign()), { ok: true, errors: [] });
  assert.ok(PATTERNS.includes("router"));
});

test("router: no router or two routers give rout.router", () => {
  const none = routerDesign({ nodes: [node("a", "planner"), node("b", "writer")], edges: [] });
  assert.ok(codes(validateDesign(none)).includes("rout.router"));
  const two = routerDesign({ nodes: [node("router", "router"), node("r2", "router"), node("w", "writer"), node("x", "critic")], edges: [edge("router", "w"), edge("router", "x")] });
  assert.ok(codes(validateDesign(two)).includes("node.agentNotAllowed") === false && codes(validateDesign(two)).includes("rout.router"));
});

test("router: fewer than two or more than six specialists give rout.specialists", () => {
  const one = routerDesign({ nodes: [node("router", "router"), node("writer", "writer")], edges: [edge("router", "writer")] });
  assert.ok(codes(validateDesign(one)).includes("rout.specialists"));
  const kinds = ["planner", "researcher", "critic", "writer", "free"];
  const many = Array.from({ length: 7 }, (_, i) => node(`s${i}`, kinds[i % 5]));
  const seven = routerDesign({ nodes: [node("router", "router"), ...many], edges: many.map((n) => edge("router", n.id)) });
  assert.ok(codes(validateDesign(seven)).includes("node.count") || codes(validateDesign(seven)).includes("rout.specialists"));
  const six = many.slice(0, 6);
  assert.equal(validateDesign(routerDesign({ nodes: [node("router", "router"), ...six], edges: six.map((n) => edge("router", n.id)) })).ok, true);
});

test("router: edges must go from the router to each specialist, once", () => {
  assert.ok(codes(validateDesign(routerDesign({ edges: [edge("router", "writer")] }))).includes("rout.edges"));
  assert.ok(codes(validateDesign(routerDesign({ edges: [edge("writer", "router"), edge("router", "researcher")] }))).includes("rout.edges"));
  assert.ok(codes(validateDesign(routerDesign({ edges: [edge("router", "writer"), edge("router", "researcher"), edge("writer", "researcher")] }))).includes("rout.edges"));
});

test("the router agent belongs only to the router pattern; specialists are the general types", () => {
  assert.deepEqual(AGENT_TYPES.router.patterns, ["router"]);
  for (const agent of ["planner", "researcher", "critic", "writer", "free"]) assert.ok(AGENT_TYPES[agent].patterns.includes("router"), agent);
  for (const agent of ["supervisor", "combiner", "debater", "judge", "evaluator"]) assert.ok(!AGENT_TYPES[agent].patterns.includes("router"), agent);
});

// ---- voting ----
const votingDesign = (extra = {}) => ({
  pattern: "voting",
  nodes: [node("a", "researcher"), node("b", "writer"), node("c", "critic"), node("tally", "tally")],
  edges: [edge("a", "tally"), edge("b", "tally"), edge("c", "tally")],
  ...extra,
});

test("voting design: one tally and three voters with an edge each is valid", () => {
  assert.deepEqual(validateDesign(votingDesign()), { ok: true, errors: [] });
  assert.ok(PATTERNS.includes("voting"));
});

test("voting: no tally or two tallies give vote.tally", () => {
  const none = votingDesign({ nodes: [node("a", "researcher"), node("b", "writer"), node("c", "critic")], edges: [] });
  assert.ok(codes(validateDesign(none)).includes("vote.tally"));
  const two = votingDesign({ nodes: [node("a", "researcher"), node("b", "writer"), node("c", "critic"), node("tally", "tally"), node("t2", "tally")], edges: [edge("a", "tally"), edge("b", "tally"), edge("c", "tally")] });
  assert.ok(codes(validateDesign(two)).includes("vote.tally"));
});

test("voting: fewer than three or more than five voters give vote.voters", () => {
  const two = votingDesign({ nodes: [node("a", "researcher"), node("b", "writer"), node("tally", "tally")], edges: [edge("a", "tally"), edge("b", "tally")] });
  assert.ok(codes(validateDesign(two)).includes("vote.voters"));
  const kinds = ["planner", "researcher", "critic", "writer", "free", "planner"];
  const voters = (n) => Array.from({ length: n }, (_, i) => node(`v${i}`, kinds[i]));
  const five = voters(5);
  assert.equal(validateDesign(votingDesign({ nodes: [...five, node("tally", "tally")], edges: five.map((v) => edge(v.id, "tally")) })).ok, true);
  const six = voters(6);
  assert.ok(codes(validateDesign(votingDesign({ nodes: [...six, node("tally", "tally")], edges: six.map((v) => edge(v.id, "tally")) }))).includes("vote.voters"));
});

test("voting: edges must go from each voter to the tally, once", () => {
  assert.ok(codes(validateDesign(votingDesign({ edges: [edge("a", "tally"), edge("b", "tally")] }))).includes("vote.edges"));
  assert.ok(codes(validateDesign(votingDesign({ edges: [edge("tally", "a"), edge("b", "tally"), edge("c", "tally")] }))).includes("vote.edges"));
  assert.ok(codes(validateDesign(votingDesign({ edges: [edge("a", "tally"), edge("b", "tally"), edge("c", "tally"), edge("a", "b")] }))).includes("vote.edges"));
});

test("the tally agent belongs only to the voting pattern; voters are the general types", () => {
  assert.deepEqual(AGENT_TYPES.tally.patterns, ["voting"]);
  for (const agent of ["planner", "researcher", "critic", "writer", "free"]) assert.ok(AGENT_TYPES[agent].patterns.includes("voting"), agent);
  for (const agent of ["supervisor", "combiner", "debater", "judge", "evaluator", "router"]) assert.ok(!AGENT_TYPES[agent].patterns.includes("voting"), agent);
});
