import test from "node:test";
import assert from "node:assert/strict";
import { parseVotingReply } from "../public/js/engine/runners/voting.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { activationsOf } from "../public/js/engine/estimate.js";

const IDS = ["a", "b", "c"];
const TALLY = '{"answer":"Blue","agree":["a","b"],"note":"c said green."}';

test("parseVotingReply reads plain, fenced and brace-wrapped JSON", () => {
  const want = { answer: "Blue", agree: ["a", "b"], note: "c said green." };
  assert.deepEqual(parseVotingReply(TALLY, IDS), want);
  assert.deepEqual(parseVotingReply("```json\n" + TALLY + "\n```", IDS), want);
  assert.deepEqual(parseVotingReply("Result: " + TALLY + " done", IDS), want);
});

test("parseVotingReply drops unknown ids and repeats; the note is optional", () => {
  assert.deepEqual(parseVotingReply('{"answer":"x","agree":["a","zzz","a"]}', IDS), { answer: "x", agree: ["a"], note: "" });
});

test("parseVotingReply refuses an empty answer, no valid voter and non-text input", () => {
  assert.equal(parseVotingReply('{"answer":"  ","agree":["a"]}', IDS), null);
  assert.equal(parseVotingReply('{"answer":"x","agree":[]}', IDS), null);
  assert.equal(parseVotingReply('{"answer":"x","agree":["zzz"]}', IDS), null);
  assert.equal(parseVotingReply('{"answer":"x","agree":"a"}', IDS), null);
  assert.equal(parseVotingReply('{"agree":["a"]}', IDS), null);
  for (const bad of [undefined, null, 5, "", "  ", "a", "[1]"]) assert.equal(parseVotingReply(bad, IDS), null, String(bad));
});

test("the tally system prompt names its role and the JSON answer", () => {
  const prompt = systemPromptFor({ id: "tally", agent: "tally" });
  assert.match(prompt, /^Role: tally/);
  assert.match(prompt, /"agree"/);
});

// ---- the runner ----
const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const design = (extra = {}) => ({
  pattern: "voting",
  nodes: [node("a", "researcher"), node("b", "writer"), node("c", "critic"), node("tally", "tally")],
  edges: [{ from: "a", to: "tally" }, { from: "b", to: "tally" }, { from: "c", to: "tally" }],
  ...extra,
});
// Voters answer by their role; the tally is told apart by its role line and replies from a script.
async function runWith(d, answers, tallyReplies, options = {}) {
  const events = [];
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    if (String(body.system).startsWith("Role: tally")) {
      const next = tallyReplies.shift();
      if (next === undefined) throw new Error("script ran out");
      return text(next);
    }
    const role = /^Role: (\w+)/.exec(body.system)[1];
    return text(answers[role] ?? "x");
  };
  const result = await runDesign({ design: d, task: "What colour is the sky?", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), ...options });
  return { result, events, calls };
}
const lastUser = (call) => call.messages.at(-1).content;
const ANSWERS = { researcher: "Blue", writer: "Blue sky", critic: "Green" };

test("the voters answer the task alone, the tally decides and its answer is the result", async () => {
  const { result, events, calls } = await runWith(design(), ANSWERS, [TALLY]);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "Blue");
  const voterCalls = calls.filter((c) => !c.system.startsWith("Role: tally"));
  assert.equal(voterCalls.length, 3);
  for (const c of voterCalls) assert.equal(lastUser(c), "Task: What colour is the sky?");
  assert.deepEqual(events.filter((e) => e.type === "handoff").map((e) => [e.from, e.to, e.note]), [["a", "tally", "Blue"], ["b", "tally", "Blue sky"], ["c", "tally", "Green"]]);
  const tallyCall = calls.find((c) => c.system.startsWith("Role: tally"));
  assert.match(lastUser(tallyCall), /Task: What colour is the sky\?/);
  assert.match(lastUser(tallyCall), /--- a ---\nBlue\n\n--- b ---\nBlue sky\n\n--- c ---\nGreen/);
});

test("a bad decision is repaired once with the voter ids; two bad decisions fail the run with an empty result", async () => {
  const ok = await runWith(design(), ANSWERS, ["nonsense", TALLY]);
  assert.equal(ok.result.outcome, "finished");
  const repairCall = ok.calls.filter((c) => c.system.startsWith("Role: tally")).at(-1);
  assert.match(lastUser(repairCall), /The voters are: a, b, c\./);
  const bad = await runWith(design(), ANSWERS, ["nonsense", "again"]);
  assert.equal(bad.result.outcome, "failed");
  assert.equal(bad.result.finalText, "");
});

test("a limit before the tally decided leaves an empty result", async () => {
  const call = async () => ({ content: [{ type: "text", text: "x" }], stop_reason: "end_turn", usage: { input_tokens: 500000, output_tokens: 5 } });
  const result = await runDesign({ design: design(), task: "t", limits: LIMIT_DEFAULTS, call, emit: () => {} });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.finalText, "");
});

test("human approval on a voter pauses the run", async () => {
  const d = design({ nodes: [node("a", "researcher", { approve: true }), node("b", "writer"), node("c", "critic"), node("tally", "tally")] });
  const { result, events } = await runWith(d, ANSWERS, [TALLY]);
  assert.equal(result.outcome, "waiting_approval");
  assert.ok(events.some((e) => e.type === "approval" && e.agent === "a"));
});

test("an own limit with pass on the tally still stops the run (its reply is a decision)", async () => {
  const d = design({ nodes: [node("a", "researcher"), node("b", "writer"), node("c", "critic"), node("tally", "tally", { limits: { maxSteps: 1 }, onLimit: "pass" })] });
  const { result } = await runWith(d, ANSWERS, ["nonsense", TALLY]);
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "agent_steps");
});

test("a mock run ends with every voter agreeing, and the estimate is voters plus two", async () => {
  const events = [];
  const result = await runDesign({ design: design(), task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  assert.equal(result.outcome, "finished");
  const output = events.filter((e) => e.type === "agent_output" && e.agent === "tally").at(-1).text;
  assert.deepEqual(parseVotingReply(output, IDS)?.agree, ["a", "b", "c"]);
  assert.equal(activationsOf(design(), LIMIT_DEFAULTS), 5);
  assert.equal(activationsOf(design(), { ...LIMIT_DEFAULTS, maxSteps: 2 }), 2);
});

// ---- found in the review ----
test("every voter is told to answer the whole task itself, whatever its role; the tally is not", () => {
  for (const agent of ["planner", "researcher", "critic", "writer", "free"]) {
    assert.match(systemPromptFor({ id: "v", agent }, { pattern: "voting" }), /one of several voters.*whole task/s, agent);
  }
  assert.doesNotMatch(systemPromptFor({ id: "tally", agent: "tally" }, { pattern: "voting" }), /one of several voters/);
  assert.doesNotMatch(systemPromptFor({ id: "v", agent: "writer" }, { pattern: "sequential" }), /one of several voters/);
});

test("the tally is told that agree must name a voter, even when no answers match, and the repair says so", async () => {
  assert.match(systemPromptFor({ id: "tally", agent: "tally" }), /at least one voter/);
  const bad = await runWith(design(), ANSWERS, ['{"answer":"x","agree":[]}', TALLY]);
  const repair = bad.calls.filter((c) => c.system.startsWith("Role: tally")).at(-1);
  assert.match(lastUser(repair), /agree must name at least one/);
  assert.equal(bad.result.outcome, "finished");
});

test("in a mock run every voter gives the same answer, whatever its role", async () => {
  const events = [];
  await runDesign({ design: design(), task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  const notes = events.filter((e) => e.type === "handoff").map((e) => e.note);
  assert.equal(notes.length, 3);
  assert.equal(new Set(notes).size, 1);
});
