import test from "node:test";
import assert from "node:assert/strict";
import { deriveInspector, evaluatorProgress, partsOf, planOf, dynamicEnd, runsOfNode } from "../public/js/replay/inspect-model.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const mapDesign = () => ({
  pattern: "mapreduce",
  nodes: [node("splitter", "splitter"), node("worker", "worker"), node("reducer", "reducer")],
  edges: [{ from: "splitter", to: "worker" }, { from: "worker", to: "reducer" }],
});
const planDesign = () => ({ pattern: "planexec", nodes: [node("planner", "planner"), node("executor", "executor")], edges: [{ from: "planner", to: "executor" }] });
const selfDesign = () => ({ pattern: "evaluator", nodes: [node("writer", "writer")], edges: [], rounds: 3, criteria: "x", selfCritique: true });

async function record(design, call = createMockCall(), limits = LIMIT_DEFAULTS) {
  const events = [];
  await runDesign({ design, task: "Explain it", limits, call, emit: (e) => events.push(e) });
  return events;
}
const upTo = (events, predicate) => events.findIndex(predicate) + 1;

test("map-reduce: the parts come from the splitter and each has a status along the run", async () => {
  const events = await record(mapDesign());
  const all = partsOf(events);
  assert.equal(all.length, 3);
  assert.deepEqual(all.map((p) => p.n), [1, 2, 3]);
  assert.deepEqual(all.map((p) => p.id), ["worker#1", "worker#2", "worker#3"]);
  assert.match(all[0].text, /Part 1/);
  assert.ok(all.every((p) => p.status === "done"));
  const early = partsOf(events, upTo(events, (e) => e.type === "handoff"));
  assert.ok(early.every((p) => p.status === "waiting"));
  const mid = partsOf(events, upTo(events, (e) => e.type === "agent_start" && e.agent === "worker#2"));
  assert.ok(mid.some((p) => p.status === "working"));
  assert.equal(partsOf(events, 0).length, 0);
});

test("plan-and-execute: the steps come from the planner, and the plan shows done, now and waiting", async () => {
  const events = await record(planDesign());
  const all = planOf(events);
  assert.equal(all.length, 3);
  assert.ok(all.every((s) => s.status === "done"));
  assert.deepEqual(all.map((s) => s.id), ["executor#1", "executor#2", "executor#3"]);
  const cut = upTo(events, (e) => e.type === "agent_start" && e.agent === "executor#2");
  assert.deepEqual(planOf(events, cut).map((s) => s.status), ["done", "working", "waiting"]);
  assert.equal(planOf(events, 0).length, 0);
});

test("parts and plan are empty for other patterns and for a bad plan", async () => {
  const events = await record(selfDesign());
  assert.deepEqual(partsOf(events), []);
  assert.deepEqual(planOf(events), []);
  assert.deepEqual(partsOf(await record(planDesign())), []);
  assert.deepEqual(planOf(await record(mapDesign())), []);
});

test("runs of a node: how many there are and how many are done", async () => {
  const events = await record(mapDesign());
  assert.deepEqual(runsOfNode(events, "worker"), { total: 3, started: 3, done: 3 });
  const mid = events.slice(0, upTo(events, (e) => e.type === "agent_output" && e.agent === "worker#1"));
  const part = runsOfNode(mid, "worker");
  assert.equal(part.total, 3);
  assert.ok(part.done >= 1 && part.done < 3);
  assert.deepEqual(runsOfNode(events, "reducer"), { total: 0, started: 0, done: 0 });
});

test("the end of a map-reduce or plan run: finished with the number of parts or steps", async () => {
  assert.deepEqual(dynamicEnd(await record(mapDesign())), { kind: "mapreduce", result: "finished", total: 3, done: 3 });
  assert.deepEqual(dynamicEnd(await record(planDesign())), { kind: "planexec", result: "finished", total: 3, done: 3 });
  assert.equal(dynamicEnd(await record(selfDesign())), null);
});

test("the end of a plan stopped by a limit says how far it got", async () => {
  let n = 0;
  const base = createMockCall();
  const call = async (body, options) => {
    const reply = await base(body, options);
    if (/^Role: executor/.test(body.system) && ++n === 3) reply.usage.input_tokens = 500000;
    return reply;
  };
  const end = dynamicEnd(await record(planDesign(), call));
  assert.equal(end.kind, "planexec");
  assert.equal(end.result, "stopped");
  assert.equal(end.total, 3);
  assert.equal(end.done, 2);
});

test("the end of a map-reduce run stopped by a limit has no result", async () => {
  const call = async (body, options) => {
    const reply = await createMockCall()(body, options);
    if (/^Role: worker/.test(body.system)) reply.usage.input_tokens = 500000;
    return reply;
  };
  const end = dynamicEnd(await record(mapDesign(), call));
  assert.equal(end.result, "stopped");
  assert.equal(end.kind, "mapreduce");
});

test("the inspector lists the numbered runs as agents with their own labels", async () => {
  const events = await record(mapDesign());
  const state = deriveInspector(events);
  assert.deepEqual(state.order.filter((id) => id.startsWith("worker#")), ["worker#1", "worker#2", "worker#3"]);
  assert.deepEqual(["worker#1", "worker#2", "worker#3"].map((id) => state.agents[id].label), ["Worker 1", "Worker 2", "Worker 3"]);
});

test("self-critique: the writer is judging while its second call of the round runs", async () => {
  const events = await record(selfDesign());
  const first = upTo(events, (e) => e.type === "agent_start");
  assert.deepEqual(evaluatorProgress(events, first), { round: 1, rounds: 3, phase: "writing" });
  const judging = upTo(events, (e) => e.type === "agent_start" && e.judging === true);
  assert.deepEqual(evaluatorProgress(events, judging), { round: 1, rounds: 3, phase: "judging" });
});

test("an old evaluator loop is read as before", () => {
  const events = [
    { type: "run_start", design: { pattern: "evaluator", rounds: 3, nodes: [node("writer", "writer"), node("evaluator", "evaluator")], edges: [{ from: "writer", to: "evaluator" }] } },
    { type: "agent_start", agent: "writer" },
    { type: "agent_start", agent: "evaluator" },
  ];
  assert.deepEqual(evaluatorProgress(events, 3), { round: 1, rounds: 3, phase: "judging" });
});

// ---- Compare ----
import { differences } from "../public/js/compare-model.js";

test("Compare shows a row for the runs of the worker when the number of parts differs, and none when it is the same", async () => {
  const withParts = (parts) => async (body, options) => {
    if (/^Role: splitter/.test(body.system)) return { content: [{ type: "text", text: JSON.stringify({ parts }) }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } };
    return createMockCall()(body, options);
  };
  const run = async (id, parts) => ({ id, task: "t", design: mapDesign(), events: await record(mapDesign(), withParts(parts)) });
  const a = await run("a", ["1", "2", "3"]);
  const b = await run("b", ["1", "2", "3", "4", "5"]);
  const rows = differences([a, b]).rows.filter((r) => r.kind === "runs");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].agent, "worker");
  assert.deepEqual(rows[0].values, [3, 5]);
  assert.equal(differences([a, await run("c", ["x", "y", "z"])]).rows.filter((r) => r.kind === "runs").length, 0);
  // a design that has no such node never gets the row
  assert.equal(differences([{ id: "p", design: planDesign(), events: [] }, { id: "q", design: planDesign(), events: [] }]).rows.filter((r) => r.kind === "runs").length, 0);
});
