import test from "node:test";
import assert from "node:assert/strict";
import { validateDesign } from "../public/js/engine/patterns.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { activationsOf } from "../public/js/engine/estimate.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const codes = (r) => r.errors.map((e) => e.code);
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const accept = JSON.stringify({ verdict: "accept" });
const revise = (feedback = "Make it shorter.") => JSON.stringify({ verdict: "revise", feedback });
const lastUser = (call) => call.messages.at(-1).content;

const selfDesign = (extra = {}) => ({ pattern: "evaluator", nodes: [node("writer", "writer")], edges: [], rounds: 3, criteria: "Short and dated.", selfCritique: true, ...extra });

async function run(design, replies, limits = LIMIT_DEFAULTS) {
  const events = [];
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    const next = replies.shift();
    if (next === undefined) throw new Error("script ran out");
    return text(next);
  };
  const result = await runDesign({ design, task: "Write it", limits, call, emit: (e) => events.push(e) });
  return { result, events, calls };
}

test("self-critique: one writer, no arrows and the switch on is valid", () => {
  assert.deepEqual(validateDesign(selfDesign()), { ok: true, errors: [] });
});

test("self-critique: any other shape gives eval.self", () => {
  const withEvaluator = selfDesign({ nodes: [node("writer", "writer"), node("evaluator", "evaluator")], edges: [{ from: "writer", to: "evaluator" }] });
  assert.ok(codes(validateDesign(withEvaluator)).includes("eval.self"));
  assert.ok(codes(validateDesign(selfDesign({ nodes: [node("critic", "critic")] }))).includes("eval.self"));
  assert.ok(codes(validateDesign(selfDesign({ nodes: [node("writer", "writer"), node("w2", "writer")] }))).includes("eval.self"));
  assert.ok(codes(validateDesign(selfDesign({ selfCritique: "yes" }))).includes("eval.self"));
  assert.ok(codes(validateDesign(selfDesign({ selfCritique: false }))).includes("eval.self"));
});

test("self-critique: the switch means nothing outside the evaluator loop", () => {
  const seq = { pattern: "sequential", nodes: [node("a", "writer")], edges: [], selfCritique: true };
  assert.ok(codes(validateDesign(seq)).includes("eval.self"));
});

test("self-critique: rounds and criteria are still checked", () => {
  assert.ok(codes(validateDesign(selfDesign({ rounds: 0 }))).includes("eval.rounds"));
  assert.ok(codes(validateDesign(selfDesign({ criteria: 5 }))).includes("eval.criteria"));
});

test("the evaluator loop without the switch is unchanged", () => {
  const plain = { pattern: "evaluator", nodes: [node("writer", "writer"), node("evaluator", "evaluator")], edges: [{ from: "writer", to: "evaluator" }], rounds: 2, criteria: "" };
  assert.deepEqual(validateDesign(plain), { ok: true, errors: [] });
});

test("self-critique: accepted in round 1, the same agent drafts and then judges with the evaluator role", async () => {
  const { result, events, calls } = await run(selfDesign(), ["DRAFT 1", accept]);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "DRAFT 1");
  assert.equal(calls.length, 2);
  assert.match(calls[0].system, /^Role: writer/);
  assert.match(calls[1].system, /^Role: evaluator/);
  assert.match(lastUser(calls[1]), /Criteria:\nShort and dated\./);
  assert.match(lastUser(calls[1]), /Draft:\nDRAFT 1/);
  const starts = events.filter((e) => e.type === "agent_start");
  assert.deepEqual(starts.map((e) => [e.agent, e.judging === true]), [["writer", false], ["writer", true]]);
  assert.deepEqual(events.filter((e) => e.type === "loop_end").map(({ result, round, judged }) => ({ result, round, judged })), [{ result: "accepted", round: 1, judged: true }]);
  assert.equal(events.filter((e) => e.type === "handoff").length, 0);
});

test("self-critique: a revision gets the draft and the feedback, then is accepted", async () => {
  const { result, calls } = await run(selfDesign(), ["DRAFT 1", revise("Add a date."), "DRAFT 2", accept]);
  assert.equal(result.finalText, "DRAFT 2");
  assert.deepEqual(calls.map((c) => /^Role: (\w+)/.exec(c.system)[1]), ["writer", "evaluator", "writer", "evaluator"]);
  assert.match(lastUser(calls[2]), /Your last draft:\nDRAFT 1/);
  assert.match(lastUser(calls[2]), /Add a date\./);
});

test("self-critique: when the rounds run out the last draft is the result, marked not accepted", async () => {
  const { result, events } = await run(selfDesign({ rounds: 2 }), ["D1", revise(), "D2", revise()]);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "D2");
  assert.deepEqual(events.filter((e) => e.type === "loop_end").map((e) => e.result), ["not_accepted"]);
});

test("self-critique: a bad verdict is repaired once, two bad verdicts fail the run", async () => {
  const ok = await run(selfDesign(), ["D1", "nonsense", accept]);
  assert.equal(ok.result.outcome, "finished");
  const bad = await run(selfDesign(), ["D1", "nonsense", "again"]);
  assert.equal(bad.result.outcome, "failed");
  assert.equal(bad.result.finalText, "D1");
});

test("self-critique: a limit that stops the run keeps the last draft", async () => {
  let n = 0;
  const call = async () => (++n === 1 ? text("DRAFT") : { content: [{ type: "text", text: accept }], stop_reason: "end_turn", usage: { input_tokens: 500000, output_tokens: 5 } });
  const events = [];
  const result = await runDesign({ design: selfDesign(), task: "t", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.finalText, "DRAFT");
});

test("self-critique: approval on the writer pauses the run", async () => {
  const { result } = await run(selfDesign({ nodes: [node("writer", "writer", { approve: true })] }), ["D1", accept]);
  assert.equal(result.outcome, "waiting_approval");
});

test("self-critique: a resumed run takes the answers of both calls from the record", async () => {
  const resume = [
    { agent: "writer", text: "D1", tokens: { input: 10, output: 5 } },
    { agent: "writer", text: revise("Shorter."), tokens: { input: 10, output: 5 } },
  ];
  const events = [];
  const calls = [];
  const replies = ["D2", accept];
  const call = async (body) => (calls.push(body), text(replies.shift()));
  const result = await runDesign({ design: selfDesign(), task: "t", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), resume });
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "D2");
  assert.equal(calls.length, 2);
});

test("self-critique: the estimate is two calls for each round, and a mock run finishes", async () => {
  assert.equal(activationsOf(selfDesign({ rounds: 3 }), LIMIT_DEFAULTS), 6);
  const result = await runDesign({ design: selfDesign(), task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: () => {} });
  assert.equal(result.outcome, "finished");
});
