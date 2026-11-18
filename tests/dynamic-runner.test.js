import test from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { activationsOf } from "../public/js/engine/estimate.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const text = (t, usage = { input_tokens: 10, output_tokens: 5 }) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage });
const lastUser = (call) => call.messages.at(-1).content;
const roleOf = (call) => /^Role: (\w+)/.exec(call.system)[1];

const mapDesign = (extra = {}) => ({
  pattern: "mapreduce",
  nodes: [node("splitter", "splitter"), node("worker", "worker"), node("reducer", "reducer")],
  edges: [{ from: "splitter", to: "worker" }, { from: "worker", to: "reducer" }],
  ...extra,
});
const planDesign = (extra = {}) => ({
  pattern: "planexec",
  nodes: [node("planner", "planner"), node("executor", "executor")],
  edges: [{ from: "planner", to: "executor" }],
  ...extra,
});
const PARTS = '{"parts":["part A","part B","part C"]}';
const STEPS = '{"steps":["find facts","weigh them","write the answer"]}';

// The splitter and the planner reply from a script; workers and executors answer from what they were given.
async function runWith(design, scripted, options = {}) {
  const events = [];
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    const role = roleOf(body);
    if (role === "splitter" || role === "planner") {
      const next = scripted.shift();
      if (next === undefined) throw new Error("script ran out");
      return text(next);
    }
    const input = String(lastUser(body));
    if (role === "worker") return text(`done ${/Your part:\n(.*)/.exec(input)?.[1]}`);
    if (role === "executor") return text(`did ${/Now do step (\d+)/.exec(input)?.[1]}`);
    if (role === "reducer") return text("merged");
    return text("x");
  };
  const result = await runDesign({ design, task: "Big task", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), ...options });
  return { result, events, calls };
}

// ---- map-reduce ----
test("map-reduce: every part goes to its own worker, the reducer merges, and its answer is the result", async () => {
  const { result, events, calls } = await runWith(mapDesign(), [PARTS]);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "merged");
  const workers = calls.filter((c) => roleOf(c) === "worker");
  assert.equal(workers.length, 3);
  assert.deepEqual(workers.map(lastUser).sort(), ["Task: Big task\n\nYour part:\npart A", "Task: Big task\n\nYour part:\npart B", "Task: Big task\n\nYour part:\npart C"]);
  const starts = events.filter((e) => e.type === "agent_start").map((e) => e.agent);
  assert.deepEqual([...new Set(starts)].sort(), ["reducer", "splitter", "worker#1", "worker#2", "worker#3"]);
  assert.deepEqual(
    events.filter((e) => e.type === "handoff").map((e) => [e.from, e.to, e.note]),
    [["splitter", "worker#1", "part A"], ["splitter", "worker#2", "part B"], ["splitter", "worker#3", "part C"], ["worker#1", "reducer", "done part A"], ["worker#2", "reducer", "done part B"], ["worker#3", "reducer", "done part C"]],
  );
  const reducer = calls.find((c) => roleOf(c) === "reducer");
  assert.match(lastUser(reducer), /Task: Big task/);
  assert.match(lastUser(reducer), /--- worker#1 ---\ndone part A\n\n--- worker#2 ---\ndone part B\n\n--- worker#3 ---\ndone part C/);
});

test("map-reduce: a worker sees its own part only", async () => {
  const { calls } = await runWith(mapDesign(), [PARTS]);
  const first = calls.find((c) => roleOf(c) === "worker");
  assert.doesNotMatch(lastUser(first), /part B|part C/);
});

test("map-reduce: a bad split is repaired once with the limits, two bad splits fail with an empty result", async () => {
  const ok = await runWith(mapDesign(), ["nonsense", PARTS]);
  assert.equal(ok.result.outcome, "finished");
  const repair = ok.calls.filter((c) => roleOf(c) === "splitter").at(-1);
  assert.match(lastUser(repair), /"parts"/);
  assert.match(lastUser(repair), /2 to 6/);
  const bad = await runWith(mapDesign(), ["nonsense", "again"]);
  assert.equal(bad.result.outcome, "failed");
  assert.equal(bad.result.finalText, "");
  assert.equal(bad.calls.filter((c) => roleOf(c) === "worker").length, 0);
});

test("map-reduce: one part or seven parts are repaired, never cut", async () => {
  const one = await runWith(mapDesign(), ['{"parts":["only"]}', PARTS]);
  assert.equal(one.calls.filter((c) => roleOf(c) === "worker").length, 3);
  const seven = await runWith(mapDesign(), ['{"parts":["1","2","3","4","5","6","7"]}', PARTS]);
  assert.equal(seven.calls.filter((c) => roleOf(c) === "worker").length, 3);
  const six = await runWith(mapDesign(), ['{"parts":["1","2","3","4","5","6"]}']);
  assert.equal(six.calls.filter((c) => roleOf(c) === "worker").length, 6);
});

test("map-reduce: a limit before the reducer answered leaves an empty result", async () => {
  const call = async (body) => (roleOf(body) === "splitter" ? text(PARTS) : text("x", { input_tokens: 500000, output_tokens: 5 }));
  const result = await runDesign({ design: mapDesign(), task: "t", limits: LIMIT_DEFAULTS, call, emit: () => {} });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.finalText, "");
});

test("map-reduce: approval on the worker pauses the run, and one approval covers every run of the worker", async () => {
  const d = mapDesign({ nodes: [node("splitter", "splitter"), node("worker", "worker", { approve: true }), node("reducer", "reducer")] });
  const paused = await runWith(d, [PARTS]);
  assert.equal(paused.result.outcome, "waiting_approval");
  const approval = paused.events.find((e) => e.type === "approval");
  assert.ok(approval && /^worker#\d$/.test(approval.agent));
  const resumed = await runWith(d, [PARTS], { approved: [approval.agent] });
  assert.equal(resumed.result.outcome, "finished");
  assert.equal(resumed.events.filter((e) => e.type === "approval").length, 0);
});

test("map-reduce: a resumed run takes the answers of finished instances from the record", async () => {
  const resume = [
    { agent: "splitter", text: PARTS, tokens: { input: 10, output: 5 } },
    { agent: "worker#1", text: "done part A", tokens: { input: 10, output: 5 } },
  ];
  const { result, calls } = await runWith(mapDesign(), [], { resume });
  assert.equal(result.outcome, "finished");
  assert.equal(calls.filter((c) => roleOf(c) === "splitter").length, 0);
  assert.equal(calls.filter((c) => roleOf(c) === "worker").length, 2);
});

test("map-reduce: a limit of the agent applies to each run of the worker", async () => {
  const d = mapDesign({ nodes: [node("splitter", "splitter"), node("worker", "worker", { limits: { maxSteps: 1 } }), node("reducer", "reducer")] });
  const { result } = await runWith(d, [PARTS]);
  assert.equal(result.outcome, "finished");
});

test("map-reduce: onLimit pass on the splitter still stops the run, its reply is a decision", async () => {
  const d = mapDesign({ nodes: [node("splitter", "splitter", { limits: { maxSteps: 1 }, onLimit: "pass" }), node("worker", "worker"), node("reducer", "reducer")] });
  const { result } = await runWith(d, ["nonsense", PARTS]);
  assert.equal(result.outcome, "stopped_limit");
});

// ---- plan-and-execute ----
test("plan-and-execute: the steps run one after another, each sees the plan and the earlier results", async () => {
  const { result, events, calls } = await runWith(planDesign(), [STEPS]);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "did 3");
  const steps = calls.filter((c) => roleOf(c) === "executor").map(lastUser);
  assert.equal(steps.length, 3);
  assert.match(steps[0], /Task: Big task/);
  assert.match(steps[0], /The plan:\n1\. find facts\n2\. weigh them\n3\. write the answer/);
  assert.match(steps[0], /Now do step 1: find facts/);
  assert.doesNotMatch(steps[0], /Results so far/);
  assert.match(steps[1], /Results so far:\n--- step 1 ---\ndid 1/);
  assert.match(steps[1], /Now do step 2: weigh them/);
  assert.match(steps[2], /--- step 1 ---\ndid 1\n\n--- step 2 ---\ndid 2/);
  assert.deepEqual(
    events.filter((e) => e.type === "handoff").map((e) => [e.from, e.to]),
    [["planner", "executor#1"], ["executor#1", "executor#2"], ["executor#2", "executor#3"]],
  );
  const starts = events.filter((e) => e.type === "agent_start").map((e) => e.agent);
  assert.deepEqual([...new Set(starts)], ["planner", "executor#1", "executor#2", "executor#3"]);
});

test("plan-and-execute: a bad plan is repaired once, two bad plans fail with an empty result", async () => {
  const ok = await runWith(planDesign(), ['{"steps":["only"]}', STEPS]);
  assert.equal(ok.result.outcome, "finished");
  assert.match(lastUser(ok.calls.filter((c) => roleOf(c) === "planner").at(-1)), /"steps"/);
  const bad = await runWith(planDesign(), ["nonsense", "again"]);
  assert.equal(bad.result.outcome, "failed");
  assert.equal(bad.result.finalText, "");
});

test("plan-and-execute: a limit after step 2 leaves the text of step 2 as the result", async () => {
  let executorCalls = 0;
  const call = async (body) => {
    if (roleOf(body) === "planner") return text(STEPS);
    executorCalls += 1;
    return executorCalls < 3 ? text(`did ${executorCalls}`) : text("late", { input_tokens: 500000, output_tokens: 5 });
  };
  const result = await runDesign({ design: planDesign(), task: "t", limits: LIMIT_DEFAULTS, call, emit: () => {} });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.finalText, "did 2");
});

test("plan-and-execute: approval on the executor pauses, and one approval covers every step", async () => {
  const d = planDesign({ nodes: [node("planner", "planner"), node("executor", "executor", { approve: true })] });
  const paused = await runWith(d, [STEPS]);
  assert.equal(paused.result.outcome, "waiting_approval");
  const approval = paused.events.find((e) => e.type === "approval");
  assert.equal(approval.agent, "executor#1");
  const resumed = await runWith(d, [STEPS], { approved: ["executor#1"] });
  assert.equal(resumed.result.outcome, "finished");
  assert.equal(resumed.events.filter((e) => e.type === "approval").length, 0);
});

test("plan-and-execute: a resumed run does not call the steps that are already answered", async () => {
  const resume = [
    { agent: "planner", text: STEPS, tokens: { input: 10, output: 5 } },
    { agent: "executor#1", text: "did 1", tokens: { input: 10, output: 5 } },
  ];
  const { result, calls } = await runWith(planDesign(), [], { resume });
  assert.equal(result.outcome, "finished");
  assert.equal(calls.filter((c) => roleOf(c) === "planner").length, 0);
  assert.equal(calls.filter((c) => roleOf(c) === "executor").length, 2);
});

// ---- mock and estimate ----
test("a mock run of each pattern finishes with three runs of its node", async () => {
  for (const [design, agent] of [[mapDesign(), "worker"], [planDesign(), "executor"]]) {
    const events = [];
    const result = await runDesign({ design, task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
    assert.equal(result.outcome, "finished", design.pattern);
    const ids = [...new Set(events.filter((e) => e.type === "agent_start" && e.agent.startsWith(`${agent}#`)).map((e) => e.agent))];
    assert.equal(ids.length, 3, design.pattern);
    assert.ok(result.finalText.length > 0);
  }
});

test("the estimate counts the most runs a node can have, plus one repair", () => {
  assert.equal(activationsOf(mapDesign(), LIMIT_DEFAULTS), Math.min(LIMIT_DEFAULTS.maxSteps, 9));
  assert.equal(activationsOf(planDesign(), LIMIT_DEFAULTS), Math.min(LIMIT_DEFAULTS.maxSteps, 8));
  assert.equal(activationsOf(mapDesign(), { ...LIMIT_DEFAULTS, maxSteps: 4 }), 4);
});
