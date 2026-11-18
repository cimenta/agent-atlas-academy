import test from "node:test";
import assert from "node:assert/strict";
import { parseHandoffReply } from "../public/js/engine/runners/handoff.js";
import { systemPromptFor, roleText } from "../public/js/engine/prompts.js";

const HAND = '{"action":"handoff","to":"b","note":"Found the facts. Write it up."}';

test("parseHandoffReply reads plain, fenced and brace-wrapped JSON", () => {
  const expected = { action: "handoff", to: "b", note: "Found the facts. Write it up." };
  assert.deepEqual(parseHandoffReply(HAND, ["b"]), expected);
  assert.deepEqual(parseHandoffReply("```json\n" + HAND + "\n```", ["b"]), expected);
  assert.deepEqual(parseHandoffReply("Here you go: " + HAND + " Done.", ["b"]), expected);
  assert.deepEqual(parseHandoffReply('{"action":"finish","answer":" All done. "}', ["b"]), { action: "finish", answer: "All done." });
});

test("parseHandoffReply refuses a target that is not allowed, and empty notes or answers", () => {
  assert.equal(parseHandoffReply(HAND, ["c"]), null);
  assert.equal(parseHandoffReply('{"action":"handoff","to":"b","note":"   "}', ["b"]), null);
  assert.equal(parseHandoffReply('{"action":"finish","answer":""}', ["b"]), null);
  assert.equal(parseHandoffReply('{"action":"finish"}', ["b"]), null);
});

test("parseHandoffReply refuses unknown actions and non-text input", () => {
  assert.equal(parseHandoffReply('{"action":"call","to":"b","note":"x"}', ["b"]), null);
  for (const bad of [undefined, null, 5, "", "   ", "not json", "[1,2]"]) assert.equal(parseHandoffReply(bad, ["b"]), null, String(bad));
});

test("with nobody to hand over to, a handoff is invalid and a finish is valid", () => {
  assert.equal(parseHandoffReply(HAND, []), null);
  assert.deepEqual(parseHandoffReply('{"action":"finish","answer":"Done"}', []), { action: "finish", answer: "Done" });
});

test("the system prompt carries the handoff protocol only in the handoff pattern", () => {
  const node = { id: "a", agent: "planner" };
  const on = systemPromptFor(node, { pattern: "handoff" });
  assert.ok(on.includes("Role: planner"));
  assert.ok(on.includes('"action":"handoff"'));
  assert.ok(!systemPromptFor(node, {}).includes('"action":"handoff"'));
  assert.ok(roleText(node, "handoff").includes('"action":"finish"'));
  assert.ok(!roleText(node).includes("handoff"));
});

// ---- the runner ----
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const hand = (to, note) => JSON.stringify({ action: "handoff", to, note });
const fin = (answer) => JSON.stringify({ action: "finish", answer });

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
const chain = (extra = {}) => ({
  pattern: "handoff",
  start: "a",
  nodes: [node("a", "planner"), node("b", "researcher"), node("c", "writer")],
  edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }],
  ...extra,
});
const pingPong = (extra = {}) => ({
  pattern: "handoff",
  start: "a",
  nodes: [node("a", "planner"), node("b", "writer")],
  edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }],
  ...extra,
});
async function runWith(design, replies, options = {}) {
  const events = [];
  const { call, calls } = scripted(replies);
  const result = await runDesign({ design, task: "Write it", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), ...options });
  return { result, events, calls };
}
const handoffs = (events) => events.filter((e) => e.type === "handoff");
const lastUser = (call) => call.messages.at(-1).content;

test("the start agent finishes at once: result is the answer, no handoff event", async () => {
  const { result, events } = await runWith(chain(), [fin("Done fast")]);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "Done fast");
  assert.equal(handoffs(events).length, 0);
});

test("A hands to B, B finishes: the event has from, to and note, and B gets the task and the note only", async () => {
  const { result, events, calls } = await runWith(chain(), [hand("b", "A found three facts. Check them."), fin("Final from B")]);
  assert.equal(result.finalText, "Final from B");
  assert.deepEqual(handoffs(events).map((e) => [e.from, e.to, e.note]), [["a", "b", "A found three facts. Check them."]]);
  const input = lastUser(calls[1]);
  assert.match(input, /Task: Write it/);
  assert.match(input, /Handed over by Planner:/);
  assert.match(input, /A found three facts\. Check them\./);
  assert.equal(calls[1].messages.length, 1);
  assert.ok(!JSON.stringify(calls[1].messages).includes("Reply with JSON"));
});

test("the first agent is told whom it may hand over to", async () => {
  const { calls } = await runWith(chain(), [fin("x")]);
  assert.match(lastUser(calls[0]), /You may hand over to: b \(Researcher\)/);
});

test("a path A to B to C", async () => {
  const { result, events } = await runWith(chain(), [hand("b", "n1"), hand("c", "n2"), fin("Done C")]);
  assert.equal(result.finalText, "Done C");
  assert.deepEqual(handoffs(events).map((e) => [e.from, e.to]), [["a", "b"], ["b", "c"]]);
});

test("a note passes through the size of a handoff", async () => {
  const { calls, events } = await runWith(chain(), [hand("b", "x".repeat(6000)), fin("ok")], { handoffChars: 2000 });
  assert.ok(!JSON.stringify(calls[1].messages).includes("x".repeat(2500)));
  assert.ok(JSON.stringify(calls[1].messages).includes("[Cut:"));
  assert.equal(handoffs(events)[0].note.length, 2000);
});

test("a handoff to an id with no arrow, to itself or to an unknown id is repaired once", async () => {
  for (const bad of ["c", "a", "zzz"]) {
    const { result, calls } = await runWith(chain(), [hand(bad, "n"), hand("b", "n"), fin("ok")]);
    assert.equal(result.outcome, "finished", bad);
    assert.match(lastUser(calls[1]), /You may hand over only to: b\./);
  }
});

test("two invalid replies in a row fail the run and the result is the last note", async () => {
  const { result } = await runWith(chain(), [hand("b", "the note"), "nonsense", "more nonsense"]);
  assert.equal(result.outcome, "failed");
  assert.equal(result.finalText, "the note");
  const early = await runWith(chain(), ["nonsense", "again"]);
  assert.equal(early.result.finalText, "");
});

test("an agent with no outgoing arrow is told it cannot hand over, and a handoff from it is repaired once", async () => {
  const { result, calls } = await runWith(chain(), [hand("b", "n1"), hand("c", "n2"), hand("a", "back"), fin("C ends")]);
  assert.match(lastUser(calls[2]), /You cannot hand over to anyone/);
  assert.match(lastUser(calls[3]), /You cannot hand over to anyone\. Reply with valid JSON/);
  assert.equal(result.finalText, "C ends");
});

test("ping-pong with different notes is stopped by the step limit; the result is the last note", async () => {
  const replies = Array.from({ length: 12 }, (_, i) => hand(i % 2 === 0 ? "b" : "a", `note ${i}`));
  const { result } = await runWith(pingPong(), replies, { limits: { ...LIMIT_DEFAULTS, maxSteps: 6 } });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "steps");
  assert.match(result.finalText, /^note \d+$/);
});

test("ping-pong with the same note is stopped by repeated answers", async () => {
  const replies = Array.from({ length: 12 }, (_, i) => hand(i % 2 === 0 ? "b" : "a", "same note"));
  const { result } = await runWith(pingPong(), replies);
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "repeat");
  assert.equal(result.finalText, "same note");
});

test("a limit before any handoff leaves an empty result", async () => {
  const events = [];
  const call = async () => ({ content: [{ type: "text", text: hand("b", "never seen") }], stop_reason: "end_turn", usage: { input_tokens: 500000, output_tokens: 5 } });
  const result = await runDesign({ design: chain(), task: "Write it", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "tokens");
  assert.equal(result.finalText, "");
});

test("human approval on the second agent pauses the run and sends no partial result", async () => {
  const design = chain({ nodes: [node("a", "planner"), node("b", "researcher", { approve: true }), node("c", "writer")] });
  const { result, events } = await runWith(design, [hand("b", "n1"), fin("x")]);
  assert.equal(result.outcome, "waiting_approval");
  assert.equal(result.finalText, "");
  assert.ok(events.some((e) => e.type === "approval" && e.agent === "b"));
});

test("a carried-on run gives the same path and result", async () => {
  const fresh = await runWith(chain(), [hand("b", "n1"), hand("c", "n2"), fin("Done")]);
  const resumed = await runWith(chain(), [hand("c", "n2"), fin("Done")], { resume: [{ agent: "a", text: hand("b", "n1"), tokens: { input: 10, output: 5 } }] });
  assert.equal(resumed.result.finalText, fresh.result.finalText);
  assert.deepEqual(handoffs(resumed.events).map((e) => [e.from, e.to]), handoffs(fresh.events).map((e) => [e.from, e.to]));
});

// ---- the mock provider and the harness ----
import { createMockCall } from "../public/js/engine/mock-anthropic.js";

async function mockRun(design) {
  const events = [];
  const result = await runDesign({ design, task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  return { result, events };
}

test("a mock run A to B finishes with one handoff and the answer of B", async () => {
  const design = chain({ nodes: [node("a", "planner"), node("b", "writer")], edges: [{ from: "a", to: "b" }] });
  const { result, events } = await mockRun(design);
  assert.equal(result.outcome, "finished");
  assert.equal(handoffs(events).length, 1);
  assert.match(result.finalText, /finished by writer/);
});

test("a mock run with arrows both ways still finishes", async () => {
  const { result, events } = await mockRun(pingPong());
  assert.equal(result.outcome, "finished");
  assert.deepEqual(handoffs(events).map((e) => [e.from, e.to]), [["a", "b"], ["b", "a"]]);
});

test("a mock run of a chain follows the path A, B, C", async () => {
  const { result, events } = await mockRun(chain());
  assert.equal(result.outcome, "finished");
  assert.deepEqual(handoffs(events).map((e) => e.to), ["b", "c"]);
});

test("the cost cap ends a handoff run with the last note", async () => {
  const design = pingPong({ nodes: [node("a", "planner", { model: "strong" }), node("b", "writer", { model: "strong" })] });
  let n = 0;
  const call = async () => ({ content: [{ type: "text", text: hand(n % 2 === 0 ? "b" : "a", `note ${n++}`) }], stop_reason: "end_turn", usage: { input_tokens: 10000, output_tokens: 10000 } });
  const result = await runDesign({ design, task: "t", limits: { ...LIMIT_DEFAULTS, maxCostUsd: 0.5 }, call, emit: () => {} });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "cost");
  assert.match(result.finalText, /^note \d+$/);
});

test("an agent's own limit with stop ends a handoff run with the last note", async () => {
  const design = pingPong({ nodes: [node("a", "planner"), node("b", "writer", { limits: { maxSteps: 1 }, onLimit: "stop" })] });
  const replies = Array.from({ length: 12 }, (_, i) => hand(i % 2 === 0 ? "b" : "a", `note ${i}`));
  const { result } = await runWith(design, replies);
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "agent_steps");
  assert.match(result.finalText, /^note \d+$/);
});

test("an agent's own limit with pass still stops a handoff run, with the last note as the result", async () => {
  const design = pingPong({ nodes: [node("a", "planner", { limits: { maxSteps: 2 }, onLimit: "pass" }), node("b", "writer")] });
  const replies = Array.from({ length: 12 }, (_, i) => hand(i % 2 === 0 ? "b" : "a", `note ${i}`));
  const { result } = await runWith(design, replies);
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "agent_steps");
  assert.match(result.finalText, /^note \d+$/);
});

test("the repair message for an agent that cannot hand over asks for valid JSON with a finish", async () => {
  const { calls } = await runWith(chain(), [hand("b", "n1"), hand("c", "n2"), "prose", fin("x")]);
  assert.match(lastUser(calls[3]), /valid JSON/);
  assert.match(lastUser(calls[3]), /finish/);
});
