import test from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { REVIEWER_SYSTEM, cleanRecordedVerdicts } from "../public/js/engine/guardrails.js";
import { withoutFailedGuardrail, resumeAnswers } from "../public/js/create/create-model.js";

const text = (t, usage = { input_tokens: 400, output_tokens: 20 }) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage });
const verdict = (v, reason = "") => JSON.stringify({ verdict: v, reason });
const REV = (extra = {}) => ({ where: "output", kind: "reviewer", onFail: "stop", policy: "No medical advice.", model: "fast", ...extra });
const designOf = (guardrails, two = false) => ({
  pattern: "sequential",
  nodes: [{ id: "writer", agent: "writer", name: "Writer", model: "fast", search: false, guardrails }, ...(two ? [{ id: "critic", agent: "critic", name: "Critic", model: "fast", search: false }] : [])],
  edges: two ? [{ from: "writer", to: "critic" }] : [],
});
function scripted({ agent, reviewer, failCritic = false }) {
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    if (body.system === REVIEWER_SYSTEM) return text(reviewer.shift());
    if (failCritic && String(body.system).includes("Role: critic")) throw new Error("the critic broke");
    return text(agent.shift());
  };
  return { call, calls };
}
const checks = (events) => events.filter((e) => e.type === "guardrail_check");
async function firstRun(design, queues) {
  const { call, calls } = scripted(queues);
  const events = [];
  const result = await runDesign({ design, task: "Task", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  return { result, events, calls };
}
const without = (events) => events.filter((e) => e.type !== "done" && e.type !== "error");

test("an agent stopped by the reviewer is asked again on Retry, and the new check is recorded once", async () => {
  const design = designOf([REV()]);
  const first = await firstRun(design, { agent: ["Take 500 mg"], reviewer: [verdict("block", "has a dose")] });
  assert.equal(first.result.outcome, "failed");
  const base = without(first.events);
  const answers = resumeAnswers(base);
  assert.equal(answers.filter((a) => a.agent === "writer").length, 0, "the stopped answer is not replayed");
  const { call, calls } = scripted({ agent: ["See a doctor"], reviewer: [verdict("pass")] });
  const events = [];
  const result = await runDesign({ design, task: "Task", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), resume: answers });
  assert.equal(result.outcome, "finished");
  assert.equal(calls.length, 2);
  assert.deepEqual(checks(events).map((e) => [e.ok, e.attempt, e.action]), [[true, 1, "passed"]]);
});

test("a recorded reviewer verdict is reused on Retry: no new call, no new event, but the steps and tokens are charged", async () => {
  const design = designOf([REV()], true);
  const first = await firstRun(design, { agent: ["Fine"], reviewer: [verdict("pass")], failCritic: true });
  assert.equal(first.result.outcome, "failed");
  assert.equal(checks(first.events).length, 1);
  const answers = resumeAnswers(without(first.events));
  assert.equal(answers.length, 1);
  assert.equal(answers[0].guardrails.length, 1);
  const { call, calls } = scripted({ agent: ["Critique"], reviewer: [] });
  const events = [];
  const result = await runDesign({ design, task: "Task", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), resume: answers });
  assert.equal(result.outcome, "finished");
  assert.equal(calls.filter((c) => c.system === REVIEWER_SYSTEM).length, 0);
  assert.equal(checks(events).length, 0);
  assert.ok(result.usage.input >= 800, `the recorded reviewer tokens are charged (${result.usage.input})`);
  assert.equal(result.usage.steps, 3);
});

test("a replayed answer whose reviewer verdict was never recorded is reviewed live", async () => {
  const design = designOf([REV()]);
  const answers = [{ agent: "writer", text: "Fine", tokens: { input: 10, output: 5 } }];
  const { call, calls } = scripted({ agent: [], reviewer: [verdict("pass")] });
  const events = [];
  const result = await runDesign({ design, task: "Task", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), resume: answers });
  assert.equal(result.outcome, "finished");
  assert.equal(calls.filter((c) => c.system === REVIEWER_SYSTEM).length, 1);
  assert.equal(checks(events).length, 1);
});

test("withoutFailedGuardrail drops the answers of an agent stopped by a guardrail", () => {
  const answers = [{ agent: "a", text: "1" }, { agent: "w", text: "2" }, { agent: "w", text: "3" }];
  const stop = (attempt) => [{ type: "guardrail_check", agent: "w", action: "stopped", attempt, ok: false }];
  assert.deepEqual(withoutFailedGuardrail(answers, stop(1)).map((a) => a.text), ["1", "2"]);
  assert.deepEqual(withoutFailedGuardrail(answers, stop(2)).map((a) => a.text), ["1"]);
  assert.deepEqual(withoutFailedGuardrail(answers, [{ type: "guardrail_check", agent: "w", action: "noted", attempt: 1, ok: false }]).length, 3);
  // A later guardrail that passed does not hide the stop (all guardrails run before the agent stops).
  assert.deepEqual(withoutFailedGuardrail(answers, [...stop(1), { type: "guardrail_check", agent: "w", action: "passed", attempt: 1, ok: true }]).map((a) => a.text), ["1", "2"]);
  // The event says how many answers the stopped try used (a format repair adds one).
  assert.deepEqual(withoutFailedGuardrail(answers, [{ type: "guardrail_check", agent: "w", action: "stopped", attempt: 1, ok: false, tries: 2 }]).map((a) => a.text), ["1"]);
  // A try that finished later (a new answer after the stop) is not dropped.
  assert.equal(withoutFailedGuardrail(answers, [...stop(1), { type: "agent_output", agent: "w", text: "4" }]).length, 3);
});

test("cleanRecordedVerdicts keeps only well-formed records", () => {
  const good = { guardrail: 2, where: "output", attempt: 1, ok: false, reason: "r", tokens: { input: 5, output: 6 }, cost: 0.1, model: "m" };
  assert.deepEqual(cleanRecordedVerdicts([good, { ...good, guardrail: 9 }, { ...good, where: "x" }, "x", null]), [good]);
  assert.deepEqual(cleanRecordedVerdicts("nope"), []);
  assert.equal(cleanRecordedVerdicts(Array(50).fill(good)).length, 12);
  assert.equal(cleanRecordedVerdicts([{ ...good, reason: "r".repeat(1000) }])[0].reason.length, 400);
});

const WORDS_STOP = { where: "output", kind: "words", onFail: "stop", words: ["bad"] };
const LEN_FLAG = { where: "output", kind: "length", onFail: "flag", max: 5000 };

test("a stop followed by a passing guardrail is still asked again on Retry", async () => {
  const design = designOf([WORDS_STOP, LEN_FLAG]);
  const first = await firstRun(design, { agent: ["a bad answer"], reviewer: [] });
  assert.equal(first.result.outcome, "failed");
  const answers = resumeAnswers(without(first.events));
  assert.equal(answers.filter((a) => a.agent === "writer").length, 0);
  const { call, calls } = scripted({ agent: ["a good answer"], reviewer: [] });
  const result = await runDesign({ design, task: "Task", limits: LIMIT_DEFAULTS, call, emit: () => {}, resume: answers });
  assert.equal(result.outcome, "finished");
  assert.equal(calls.length, 1);
});

test("a stop after a format repair drops both answers, so Retry asks afresh and records no check twice", async () => {
  const design = designOf([WORDS_STOP]);
  design.nodes[0].format = { fields: [{ name: "title", type: "text" }] };
  const first = await firstRun(design, { agent: ["not json", JSON.stringify({ title: "bad" })], reviewer: [] });
  assert.equal(first.result.outcome, "failed");
  const answers = resumeAnswers(without(first.events));
  assert.equal(answers.filter((a) => a.agent === "writer").length, 0);
  const { call, calls } = scripted({ agent: [JSON.stringify({ title: "fine" })], reviewer: [] });
  const events = [];
  const result = await runDesign({ design, task: "Task", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), resume: answers });
  assert.equal(result.outcome, "finished");
  assert.equal(calls.length, 1);
  assert.equal(events.filter((e) => e.type === "format_check").length, 1);
});

test("input checks of an agent that failed before it answered are not recorded or paid for twice on Retry", async () => {
  const design = designOf([REV({ where: "input" }), { where: "input", kind: "secret", onFail: "flag" }]);
  let failOnce = true;
  const calls1 = [];
  const call1 = async (body) => {
    calls1.push(body.system === REVIEWER_SYSTEM ? "reviewer" : "agent");
    if (body.system === REVIEWER_SYSTEM) return text(verdict("pass"));
    if (failOnce) {
      failOnce = false;
      throw new Error("the provider broke");
    }
    return text("Fine");
  };
  const events1 = [];
  const first = await runDesign({ design, task: "Task", limits: LIMIT_DEFAULTS, call: call1, emit: (e) => events1.push(e) });
  assert.equal(first.outcome, "failed");
  assert.equal(checks(events1).length, 2);
  const answers = resumeAnswers(without(events1));
  const events2 = [];
  const calls2 = [];
  const call2 = async (body) => {
    calls2.push(body.system === REVIEWER_SYSTEM ? "reviewer" : "agent");
    return text("Fine");
  };
  const second = await runDesign({ design, task: "Task", limits: LIMIT_DEFAULTS, call: call2, emit: (e) => events2.push(e), resume: answers });
  assert.equal(second.outcome, "finished");
  assert.deepEqual(calls2, ["agent"]);
  assert.equal(checks(events2).length, 0);
  assert.ok(second.usage.input >= 400, "the recorded reviewer tokens are charged");
});

test("a reviewer that gave no verdict because the provider was down is called again on Retry", () => {
  const events = [{ type: "guardrail_check", agent: "writer", guardrail: 1, where: "input", kind: "reviewer", ok: false, attempt: 1, action: "stopped", reason: "the reviewer gave no verdict" }];
  assert.deepEqual(resumeAnswers(events), []);
});

test("a recorded verdict can never lower the budget", () => {
  const rec = cleanRecordedVerdicts([{ guardrail: 1, where: "output", attempt: 1, ok: true, reason: "", tokens: { input: -500, output: -5 }, cost: -3, model: "m" }])[0];
  assert.deepEqual([rec.tokens.input, rec.tokens.output, rec.cost], [0, 0, 0]);
});
