import test from "node:test";
import assert from "node:assert/strict";
import { parseRouterReply } from "../public/js/engine/runners/router.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { activationsOf } from "../public/js/engine/estimate.js";

const ROUTE = '{"route":"w","reason":"A writing task."}';

test("parseRouterReply reads plain, fenced and brace-wrapped JSON", () => {
  const want = { route: "w", reason: "A writing task." };
  assert.deepEqual(parseRouterReply(ROUTE, ["w", "r"]), want);
  assert.deepEqual(parseRouterReply("```json\n" + ROUTE + "\n```", ["w"]), want);
  assert.deepEqual(parseRouterReply("Choice: " + ROUTE + " ok", ["w"]), want);
});

test("parseRouterReply refuses an unlisted id, an empty reason and non-text input", () => {
  assert.equal(parseRouterReply(ROUTE, ["r"]), null);
  assert.equal(parseRouterReply('{"route":"w","reason":"  "}', ["w"]), null);
  assert.equal(parseRouterReply('{"route":"w"}', ["w"]), null);
  for (const bad of [undefined, null, 5, "", "  ", "w", "[1]"]) assert.equal(parseRouterReply(bad, ["w"]), null, String(bad));
});

test("the router system prompt names its role and the JSON answer", () => {
  const prompt = systemPromptFor({ id: "router", agent: "router" });
  assert.match(prompt, /^Role: router/);
  assert.match(prompt, /"route"/);
});

// ---- the runner ----
const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const design = (extra = {}) => ({
  pattern: "router",
  nodes: [node("router", "router"), node("w", "writer"), node("r", "researcher")],
  edges: [{ from: "router", to: "w" }, { from: "router", to: "r" }],
  ...extra,
});
async function runWith(d, replies, options = {}) {
  const events = [];
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    const next = replies.shift();
    if (next === undefined) throw new Error("script ran out");
    return text(next);
  };
  const result = await runDesign({ design: d, task: "Write it", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), ...options });
  return { result, events, calls };
}
const lastUser = (call) => call.messages.at(-1).content;

test("the router chooses, the specialist answers the task only, and the answer is the result", async () => {
  const { result, events, calls } = await runWith(design(), [ROUTE, "Written answer"]);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "Written answer");
  assert.deepEqual(events.filter((e) => e.type === "handoff").map((e) => [e.from, e.to, e.note]), [["router", "w", "A writing task."]]);
  assert.match(lastUser(calls[0]), /You may route to: w \(Writer\), r \(Researcher\)/);
  assert.equal(lastUser(calls[1]), "Task: Write it");
  assert.equal(calls[1].messages.length, 1);
});

test("a free agent is listed with its name and the start of its instructions", async () => {
  const d = design({ nodes: [node("router", "router"), node("w", "writer"), node("f", "free", { name: "Poet", instructions: "Write in rhyme. ".repeat(10) })], edges: [{ from: "router", to: "w" }, { from: "router", to: "f" }] });
  const { calls } = await runWith(d, ['{"route":"f","reason":"rhyme"}', "x"]);
  assert.match(lastUser(calls[0]), /f \(Poet: Write in rhyme\./);
  assert.ok(lastUser(calls[0]).length < 400);
});

test("a bad choice is repaired once with the ids; two bad choices fail the run with an empty result", async () => {
  const ok = await runWith(design(), ['{"route":"zzz","reason":"x"}', ROUTE, "A"]);
  assert.equal(ok.result.outcome, "finished");
  assert.match(lastUser(ok.calls[1]), /You may route only to: w, r\./);
  const bad = await runWith(design(), ["nonsense", "again"]);
  assert.equal(bad.result.outcome, "failed");
  assert.equal(bad.result.finalText, "");
});

test("a limit after the choice and before the answer leaves an empty result", async () => {
  const call = async () => ({ content: [{ type: "text", text: ROUTE }], stop_reason: "end_turn", usage: { input_tokens: 500000, output_tokens: 5 } });
  const result = await runDesign({ design: design(), task: "t", limits: LIMIT_DEFAULTS, call, emit: () => {} });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.finalText, "");
});

test("human approval on the specialist pauses the run", async () => {
  const d = design({ nodes: [node("router", "router"), node("w", "writer", { approve: true }), node("r", "researcher")] });
  const { result, events } = await runWith(d, [ROUTE, "A"]);
  assert.equal(result.outcome, "waiting_approval");
  assert.ok(events.some((e) => e.type === "approval" && e.agent === "w"));
});

test("a carried-on run gives the same route and result", async () => {
  const resumed = await runWith(design(), ["Written answer"], { resume: [{ agent: "router", text: ROUTE, tokens: { input: 10, output: 5 } }] });
  assert.equal(resumed.result.finalText, "Written answer");
});

test("a mock run ends with the first specialist, and the estimate is three", async () => {
  const events = [];
  const result = await runDesign({ design: design(), task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  assert.equal(result.outcome, "finished");
  assert.equal(events.find((e) => e.type === "handoff").to, "w");
  assert.equal(activationsOf(design(), LIMIT_DEFAULTS), 3);
  assert.equal(activationsOf(design(), { ...LIMIT_DEFAULTS, maxSteps: 1 }), 1);
});

// ---- found in the review ----
test("an own limit with pass on the router still stops the run (its reply is a decision)", async () => {
  const d = design({ nodes: [node("router", "router", { limits: { maxSteps: 1 }, onLimit: "pass" }), node("w", "writer"), node("r", "researcher")] });
  const { result } = await runWith(d, ["nonsense", ROUTE, "A"]);
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "agent_steps");
});

test("the instructions of a free agent are listed on one line, without commas or brackets breaking the list", async () => {
  const d = design({ nodes: [node("router", "router"), node("w", "writer"), node("f", "free", { name: "Poet", instructions: "Line one,\nline two (x)\n\nend" })], edges: [{ from: "router", to: "w" }, { from: "router", to: "f" }] });
  const { calls } = await runWith(d, ['{"route":"f","reason":"rhyme"}', "x"]);
  const listed = lastUser(calls[0]).split("You may route to: ")[1];
  assert.ok(!listed.includes("\n"));
  assert.match(listed, /f \(Poet: Line one; line two x end\)$/);
});
