import { test } from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { parseSupervisorReply } from "../public/js/engine/runners/supervisor.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const edge = (from, to) => ({ from, to });
const text = (t, u = { input_tokens: 10, output_tokens: 5 }) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: u });
const callJson = (worker, instruction = "do it") => JSON.stringify({ action: "call", worker, instruction });
const finishJson = (answer = "FINAL") => JSON.stringify({ action: "finish", answer });

function scripted(replies) {
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    const next = replies.shift();
    if (next === undefined) throw new Error("script ran out");
    return typeof next === "string" ? text(next) : next;
  };
  return { call, calls };
}

const supervisorDesign = () => ({
  pattern: "supervisor",
  nodes: [node("supervisor", "supervisor"), node("researcher", "researcher"), node("writer", "writer")],
  edges: [edge("supervisor", "researcher"), edge("supervisor", "writer")],
});
const debateDesign = () => ({
  pattern: "debate",
  nodes: [node("debater", "debater", { stance: "for" }), node("debater-2", "debater", { stance: "against" }), node("judge", "judge")],
  edges: [edge("debater", "judge"), edge("debater-2", "judge")],
  rounds: 2,
});

async function run(design, call, limits = LIMIT_DEFAULTS) {
  const events = [];
  const result = await runDesign({ design, task: "Should we?", limits, call, emit: (e) => events.push(e) });
  return { result, events };
}

test("parseSupervisorReply reads plain, fenced and surrounded JSON", () => {
  assert.deepEqual(parseSupervisorReply(callJson("a", "go")), { action: "call", worker: "a", instruction: "go" });
  assert.deepEqual(parseSupervisorReply("```json\n" + finishJson("ok") + "\n```"), { action: "finish", answer: "ok" });
  assert.deepEqual(parseSupervisorReply(`Sure thing! ${callJson("b")} Hope that helps.`), { action: "call", worker: "b", instruction: "do it" });
});

test("parseSupervisorReply returns null for anything else", () => {
  assert.equal(parseSupervisorReply("hello"), null);
  assert.equal(parseSupervisorReply(JSON.stringify({ action: "dance" })), null);
  assert.equal(parseSupervisorReply(JSON.stringify({ action: "call" })), null);
  assert.equal(parseSupervisorReply(JSON.stringify({ action: "finish" })), null);
  assert.equal(parseSupervisorReply(""), null);
  assert.equal(parseSupervisorReply(undefined), null);
});

test("the supervisor calls two workers and then finishes", async () => {
  const { call, calls } = scripted([callJson("researcher", "find facts"), "FACTS", callJson("writer", "write it"), "DRAFT", finishJson("FINAL ANSWER")]);
  const { result, events } = await run(supervisorDesign(), call);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "FINAL ANSWER");
  assert.ok(calls[0].messages[0].content.includes("Workers: researcher, writer"));
  assert.ok(calls[1].messages[0].content.includes("find facts"));
  assert.ok(calls[2].messages[calls[2].messages.length - 1].content.includes("Result from researcher:\nFACTS"));
  assert.deepEqual(
    events.filter((e) => e.type === "handoff").map((e) => `${e.from}>${e.to}`),
    ["supervisor>researcher", "researcher>supervisor", "supervisor>writer", "writer>supervisor"],
  );
});

test("a first invalid reply is corrected once", async () => {
  const { call, calls } = scripted(["I think we are done", finishJson("OK")]);
  const { result } = await run(supervisorDesign(), call);
  assert.equal(result.outcome, "finished");
  assert.equal(calls.length, 2);
  assert.ok(calls[1].messages[calls[1].messages.length - 1].content.includes("valid JSON"));
});

test("two invalid replies in a row fail the run", async () => {
  const { call } = scripted(["nope", "still nope"]);
  const { result, events } = await run(supervisorDesign(), call);
  assert.equal(result.outcome, "failed");
  assert.ok(events.find((e) => e.type === "error").message.includes("supervisor.invalid"));
});

test("a worker that does not exist counts as an invalid reply", async () => {
  const { call } = scripted([callJson("ghost"), callJson("ghost")]);
  const { result } = await run(supervisorDesign(), call);
  assert.equal(result.outcome, "failed");
});

test("finishing without calling any worker is valid", async () => {
  const { call } = scripted([finishJson("quick")]);
  const { result } = await run(supervisorDesign(), call);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "quick");
});

test("a supervisor that never finishes stops at the step limit", async () => {
  const call = async (body) => (/^Role: supervisor/.test(body.system) ? text(callJson("researcher")) : text("more facts"));
  const { result } = await run(supervisorDesign(), call, { ...LIMIT_DEFAULTS, maxSteps: 6 });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "steps");
});

test("debate: debaters alternate, each turn sees the earlier ones, then the judge decides", async () => {
  const { call, calls } = scripted(["A1", "B1", "A2", "B2", "VERDICT"]);
  const { result, events } = await run(debateDesign(), call);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "VERDICT");
  assert.equal(calls.length, 5);
  const last = (c) => c.messages[c.messages.length - 1].content;
  assert.ok(!last(calls[0]).includes("A1"));
  assert.ok(last(calls[1]).includes("A1"));
  assert.ok(last(calls[2]).includes("A1") && last(calls[2]).includes("B1"));
  for (const part of ["A1", "B1", "A2", "B2"]) assert.ok(last(calls[4]).includes(part), part);
  assert.ok(calls[0].system.includes('"for"') && calls[1].system.includes('"against"'));
  assert.deepEqual(events.filter((e) => e.type === "handoff").map((e) => e.from), ["debater", "debater-2", "debater", "debater-2"]);
  assert.ok(events.filter((e) => e.type === "handoff").every((e) => e.to === "judge"));
});

test("a debate that hits the token budget mid-round is stopped", async () => {
  const big = text("long", { input_tokens: 20, output_tokens: 20 });
  const { call } = scripted([big, big, big, big, big]);
  const { result } = await run(debateDesign(), call, { ...LIMIT_DEFAULTS, maxTokens: 60 });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "tokens");
});

const callsJson = (...workers) => JSON.stringify({ action: "call", calls: workers.map((worker) => ({ worker, instruction: `do ${worker}` })) });

test("parseSupervisorReply reads a call to several workers at once", () => {
  assert.deepEqual(parseSupervisorReply(callsJson("a", "b")), {
    action: "call",
    calls: [{ worker: "a", instruction: "do a" }, { worker: "b", instruction: "do b" }],
  });
  assert.equal(parseSupervisorReply(JSON.stringify({ action: "call", calls: [] })), null);
  assert.equal(parseSupervisorReply(JSON.stringify({ action: "call", calls: [{ instruction: "x" }] })), null);
});

test("the supervisor can call two workers at the same time and gets both results back", async () => {
  const replies = [callsJson("researcher", "writer"), finishJson("BOTH DONE")];
  let running = 0;
  let mostAtOnce = 0;
  const seen = [];
  const call = async (body) => {
    seen.push(structuredClone(body));
    const system = JSON.stringify(body.system ?? "");
    const isBoss = system.includes("You are the Supervisor");
    if (isBoss) return text(replies.shift());
    running += 1;
    mostAtOnce = Math.max(mostAtOnce, running);
    await new Promise((resolve) => setTimeout(resolve, 20));
    running -= 1;
    return text(`RESULT ${body.messages[0].content.includes("do researcher") ? "R" : "W"}`);
  };
  const { result, events } = await run(supervisorDesign(), call);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "BOTH DONE");
  assert.equal(mostAtOnce, 2);
  const handoffs = events.filter((e) => e.type === "handoff").map((e) => `${e.from}>${e.to}`);
  assert.deepEqual(handoffs.slice(0, 2), ["supervisor>researcher", "supervisor>writer"]);
  assert.deepEqual(handoffs.slice(2).sort(), ["researcher>supervisor", "writer>supervisor"]);
  const last = seen.at(-1).messages.at(-1).content;
  assert.ok(last.includes("Result from researcher:\nRESULT R"));
  assert.ok(last.includes("Result from writer:\nRESULT W"));
});

test("calling the same worker twice in one reply, or an unknown one, is an invalid reply", async () => {
  const { call } = scripted([callsJson("writer", "writer"), callsJson("writer", "nobody")]);
  const { result, events } = await run(supervisorDesign(), call);
  assert.equal(result.outcome, "failed");
  assert.ok(events.find((e) => e.type === "error").message.includes("supervisor.invalid"));
});
