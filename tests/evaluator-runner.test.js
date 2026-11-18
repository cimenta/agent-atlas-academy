import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVerdict } from "../public/js/engine/runners/evaluator.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";

test("parseVerdict reads plain, fenced and brace-wrapped JSON", () => {
  assert.deepEqual(parseVerdict('{"verdict":"accept"}'), { verdict: "accept" });
  assert.deepEqual(parseVerdict('```json\n{"verdict":"revise","feedback":"Add a date."}\n```'), { verdict: "revise", feedback: "Add a date." });
  assert.deepEqual(parseVerdict('Here is my answer: {"verdict":"accept"} Done.'), { verdict: "accept" });
});

test("parseVerdict accepts only the words accept and revise (case and spaces ignored)", () => {
  assert.deepEqual(parseVerdict('{"verdict":" ACCEPT "}'), { verdict: "accept" });
  assert.equal(parseVerdict('{"verdict":"approve"}'), null);
  assert.equal(parseVerdict('{"decision":"accept"}'), null);
});

test("parseVerdict: revise needs feedback text", () => {
  assert.equal(parseVerdict('{"verdict":"revise"}'), null);
  assert.equal(parseVerdict('{"verdict":"revise","feedback":"   "}'), null);
});

test("parseVerdict: non-string, empty and non-JSON input give null", () => {
  for (const bad of [undefined, null, 5, "", "   ", "accept", "[1,2]", "{not json}"]) assert.equal(parseVerdict(bad), null, String(bad));
});

test("the evaluator system prompt names its role and the JSON answer", () => {
  const prompt = systemPromptFor({ id: "e", agent: "evaluator", model: "fast", search: false });
  assert.match(prompt, /^Role: evaluator/);
  assert.match(prompt, /JSON/);
  assert.match(prompt, /"verdict":"accept"/);
});

// ---- the runner ----
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { validateRun } from "../public/js/run-schema.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const accept = JSON.stringify({ verdict: "accept" });
const revise = (feedback = "Make it shorter.") => JSON.stringify({ verdict: "revise", feedback });

function scripted(replies) {
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    const next = replies.shift();
    if (next === undefined) throw new Error("script ran out");
    return text(next);
  };
  return { call, calls };
}
const evaluatorDesign = (extra = {}) => ({
  pattern: "evaluator",
  nodes: [node("writer", "writer"), node("evaluator", "evaluator")],
  edges: [{ from: "writer", to: "evaluator" }],
  rounds: 3,
  criteria: "Short and dated.",
  ...extra,
});
async function run(design, replies, limits = LIMIT_DEFAULTS) {
  const events = [];
  const { call, calls } = scripted(replies);
  const result = await runDesign({ design, task: "Write it", limits, call, emit: (e) => events.push(e) });
  return { result, events, calls };
}
const loopEnd = (events) => events.filter((e) => e.type === "loop_end");
const lastUser = (call) => call.messages.at(-1).content;

test("accepted in round 1: the draft is the result and loop_end says accepted", async () => {
  const { result, events } = await run(evaluatorDesign(), ["DRAFT 1", accept]);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "DRAFT 1");
  assert.deepEqual(loopEnd(events).map(({ result, round, judged }) => ({ result, round, judged })), [{ result: "accepted", round: 1, judged: true }]);
});

test("revise then accept: second draft wins, and the writer is given the draft and the feedback", async () => {
  const { result, events, calls } = await run(evaluatorDesign(), ["DRAFT 1", revise("Add the date."), "DRAFT 2", accept]);
  assert.equal(result.finalText, "DRAFT 2");
  assert.equal(loopEnd(events)[0].round, 2);
  const writerAgain = lastUser(calls[2]);
  assert.match(writerAgain, /DRAFT 1/);
  assert.match(writerAgain, /Add the date\./);
  assert.match(lastUser(calls[1]), /Short and dated\./);
  assert.match(lastUser(calls[1]), /DRAFT 1/);
});

test("rounds=3 and always revise: last draft returned, not_accepted, finished (not an error)", async () => {
  const { result, events } = await run(evaluatorDesign(), ["D1", revise("a"), "D2", revise("b"), "D3", revise("c")]);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "D3");
  assert.deepEqual(loopEnd(events).map(({ result, round, judged }) => ({ result, round, judged })), [{ result: "not_accepted", round: 3, judged: true }]);
});

test("rounds=1 and revise: the first draft comes back as not_accepted and no second draft is written", async () => {
  const { result, events, calls } = await run(evaluatorDesign({ rounds: 1 }), ["D1", revise()]);
  assert.equal(result.finalText, "D1");
  assert.equal(calls.length, 2);
  assert.equal(loopEnd(events)[0].result, "not_accepted");
});

test("one invalid verdict is repaired once; two in a row fail the run", async () => {
  const ok = await run(evaluatorDesign(), ["D1", "I think it is fine", accept]);
  assert.equal(ok.result.outcome, "finished");
  assert.match(lastUser(ok.calls[2]), /valid JSON/);
  const bad = await run(evaluatorDesign(), ["D1", "fine", "still fine"]);
  assert.equal(bad.result.outcome, "failed");
  assert.equal(loopEnd(bad.events).length, 0);
});

test("a limit between the draft and its verdict: stopped_limit, the draft is the result, judged false", async () => {
  const { result, events } = await run(evaluatorDesign(), ["D1", accept], { ...LIMIT_DEFAULTS, maxSteps: 1 });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.finalText, "D1");
  assert.deepEqual(loopEnd(events).map(({ result, round, judged }) => ({ result, round, judged })), [{ result: "stopped", round: 1, judged: false }]);
});

test("a limit after a verdict: stopped, judged true, the last judged draft is the result", async () => {
  const { result, events } = await run(evaluatorDesign(), ["D1", revise(), "D2"], { ...LIMIT_DEFAULTS, maxSteps: 2 });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.finalText, "D1");
  assert.deepEqual(loopEnd(events).map(({ result, round, judged }) => ({ result, round, judged })), [{ result: "stopped", round: 1, judged: true }]);
});

test("empty criteria are sent as (none given)", async () => {
  const { calls } = await run(evaluatorDesign({ criteria: "  " }), ["D1", accept]);
  assert.match(lastUser(calls[1]), /\(none given\)/);
});

test("the handoffs carry the draft and the feedback, and a run with loop_end is a valid record", async () => {
  const { events } = await run(evaluatorDesign(), ["D1", revise("Fix it."), "D2", accept]);
  const handoffs = events.filter((e) => e.type === "handoff").map((e) => [e.from, e.to, e.note]);
  assert.deepEqual(handoffs, [["writer", "evaluator", "D1"], ["evaluator", "writer", "Fix it."], ["writer", "evaluator", "D2"]]);
  assert.deepEqual(validateRun({ version: 1, events }).errors?.filter((e) => /loop_end|type/.test(e)) ?? [], []);
});

// ---- the harness on the evaluator loop ----
const bigText = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10000, output_tokens: 10000 } });

async function runWith(design, replies, options = {}) {
  const events = [];
  const { call, calls } = scripted(replies);
  const result = await runDesign({ design, task: "Write it", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), ...options });
  return { result, events, calls };
}

test("repeated answers stop the loop (reason repeat) and the last draft is kept", async () => {
  const { result, events } = await runWith(evaluatorDesign({ rounds: 4 }), ["SAME", revise("a"), "SAME", revise("b"), "SAME", revise("c")], { repeatStop: 2 });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "repeat");
  assert.equal(result.finalText, "SAME");
  assert.equal(loopEnd(events)[0].result, "stopped");
});

test("a cost cap stops the loop and the draft is kept", async () => {
  const events = [];
  const result = await runDesign({
    design: evaluatorDesign({ nodes: [node("writer", "writer", { model: "strong" }), node("evaluator", "evaluator", { model: "strong" })] }),
    task: "t",
    limits: { ...LIMIT_DEFAULTS, maxCostUsd: 0.5 },
    call: async () => bigText("DRAFT"),
    emit: (e) => events.push(e),
  });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "cost");
  assert.equal(loopEnd(events)[0].result, "stopped");
});

test("an agent's own token limit: with stop the run ends; with pass the verdict it wrote is kept and the loop goes on", async () => {
  const limited = (onLimit) => evaluatorDesign({ nodes: [node("writer", "writer"), node("evaluator", "evaluator", { limits: { maxTokens: 1000 }, onLimit })] });
  const go = async (onLimit) => {
    const replies = ["D1", accept];
    const events = [];
    const result = await runDesign({
      design: limited(onLimit),
      task: "t",
      limits: LIMIT_DEFAULTS,
      call: async () => ({ content: [{ type: "text", text: replies.shift() }], stop_reason: "end_turn", usage: { input_tokens: 900, output_tokens: 300 } }),
      emit: (e) => events.push(e),
    });
    return { result, events };
  };
  const stop = await go("stop");
  assert.equal(stop.result.outcome, "stopped_limit");
  assert.equal(loopEnd(stop.events)[0].result, "stopped");
  const pass = await go("pass");
  assert.equal(pass.result.outcome, "finished");
  assert.equal(loopEnd(pass.events)[0].result, "accepted");
});

test("human approval before the evaluator pauses the run and sends no loop_end", async () => {
  const design = evaluatorDesign({ nodes: [node("writer", "writer"), node("evaluator", "evaluator", { approve: true })] });
  const { result, events } = await runWith(design, ["D1", accept]);
  assert.equal(result.outcome, "waiting_approval");
  assert.equal(loopEnd(events).length, 0);
  assert.ok(events.some((e) => e.type === "approval" && e.agent === "evaluator"));
});

test("a carried-on run gives the same ending and the same result", async () => {
  const fresh = await runWith(evaluatorDesign(), ["D1", revise("a"), "D2", accept]);
  const resumed = await runWith(evaluatorDesign(), ["D2", accept], {
    resume: [
      { agent: "writer", text: "D1", tokens: { input: 10, output: 5 } },
      { agent: "evaluator", text: revise("a"), tokens: { input: 10, output: 5 } },
    ],
  });
  assert.equal(resumed.result.finalText, fresh.result.finalText);
  assert.deepEqual(loopEnd(resumed.events).map((e) => [e.result, e.round]), loopEnd(fresh.events).map((e) => [e.result, e.round]));
});

test("the size of a handoff shortens the draft the evaluator and the writer receive", async () => {
  const long = "x".repeat(6000);
  const { calls } = await runWith(evaluatorDesign(), [long, revise("a"), "D2", accept], { handoffChars: 2000 });
  assert.ok(!JSON.stringify(calls[1].messages).includes("x".repeat(2500)));
  assert.ok(JSON.stringify(calls[1].messages).includes("[Cut:"));
  assert.ok(!JSON.stringify(calls[2].messages.at(-1)).includes("x".repeat(2500)));
});
