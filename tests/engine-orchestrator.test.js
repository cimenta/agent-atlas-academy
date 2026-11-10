import { test } from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { AnthropicError } from "../public/js/engine/anthropic.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const edge = (from, to) => ({ from, to });
const usage = (input = 10, output = 5) => ({ input_tokens: input, output_tokens: output });
const reply = (text, u = usage()) => ({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: u });
const roleOf = (body) => /^Role: (\w+)/.exec(body.system)[1];

const chain = () => ({
  pattern: "sequential",
  nodes: [node("planner", "planner"), node("researcher", "researcher"), node("writer", "writer")],
  edges: [edge("planner", "researcher"), edge("researcher", "writer")],
});
const fan = () => ({
  pattern: "parallel",
  nodes: [node("researcher", "researcher"), node("researcher-2", "researcher"), node("combiner", "combiner")],
  edges: [edge("researcher", "combiner"), edge("researcher-2", "combiner")],
});

function byRole(map) {
  const calls = [];
  const call = async (body, opts) => {
    calls.push({ body: structuredClone(body), opts });
    return reply(map[roleOf(body)] ?? "text");
  };
  return { call, calls };
}

async function run(design, call, extra = {}) {
  const events = [];
  const result = await runDesign({
    design,
    task: "Why is the sky blue?",
    limits: LIMIT_DEFAULTS,
    call,
    emit: (e) => events.push(e),
    ...extra,
  });
  return { result, events };
}

const doneEvents = (events) => events.filter((e) => e.type === "done");
const flush = () => new Promise((resolve) => setImmediate(resolve));

test("sequential passes each output to the next agent and ends finished", async () => {
  const { call, calls } = byRole({ planner: "PLAN-TEXT", researcher: "FACTS-TEXT", writer: "FINAL-TEXT" });
  const { result, events } = await run(chain(), call);
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "FINAL-TEXT");
  assert.deepEqual(calls.map((c) => roleOf(c.body)), ["planner", "researcher", "writer"]);
  assert.ok(calls[0].body.messages[0].content.includes("Why is the sky blue?"));
  assert.ok(calls[1].body.messages[0].content.includes("PLAN-TEXT"));
  assert.ok(calls[2].body.messages[0].content.includes("FACTS-TEXT"));
  assert.deepEqual(events.filter((e) => e.type === "handoff").map((e) => [e.from, e.to]), [["planner", "researcher"], ["researcher", "writer"]]);
  assert.equal(events[0].type, "run_start");
  assert.equal(events[0].pattern, "sequential");
  assert.equal(doneEvents(events).length, 1);
  assert.equal(doneEvents(events)[0].outcome, "finished");
  assert.equal(doneEvents(events)[0].finalText, "FINAL-TEXT");
});

test("event times never go backwards", async () => {
  const { call } = byRole({});
  const { events } = await run(chain(), call);
  for (let i = 1; i < events.length; i++) assert.ok(events[i].t >= events[i - 1].t);
  assert.ok(events.every((e) => typeof e.t === "number"));
});

test("done usage equals the budget totals", async () => {
  const { call } = byRole({});
  const { result, events } = await run(chain(), call);
  assert.deepEqual(result.usage, { input: 30, output: 15, searches: 0, steps: 3 });
  assert.deepEqual(doneEvents(events)[0].usage, result.usage);
});

test("parallel workers run at the same time and the combiner sees every result", async () => {
  const pending = [];
  const calls = [];
  const call = (body) => {
    calls.push(structuredClone(body));
    if (roleOf(body) === "combiner") return Promise.resolve(reply("COMBINED"));
    return new Promise((resolve) => pending.push(() => resolve(reply(`RESULT-${pending.length}`))));
  };
  const events = [];
  const promise = runDesign({ design: fan(), task: "t", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  await flush();
  assert.equal(pending.length, 2);
  assert.equal(events.filter((e) => e.type === "agent_start").length, 2);
  assert.equal(events.filter((e) => e.type === "agent_output").length, 0);
  pending[0]();
  pending[1]();
  const result = await promise;
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "COMBINED");
  const combinerInput = calls.find((c) => roleOf(c) === "combiner").messages[0].content;
  assert.ok(combinerInput.includes("researcher") && combinerInput.includes("researcher-2"));
  assert.deepEqual(events.filter((e) => e.type === "handoff").map((e) => e.to), ["combiner", "combiner"]);
});

test("agents after the combiner work in order on the combined answer", async () => {
  const design = fan();
  design.nodes.push(node("critic", "critic"), node("writer", "writer"));
  design.edges.push(edge("combiner", "critic"), edge("critic", "writer"));
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    return reply(roleOf(body).toUpperCase());
  };
  const events = [];
  const result = await runDesign({ design, task: "t", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  assert.equal(result.outcome, "finished");
  assert.equal(result.finalText, "WRITER");
  assert.deepEqual(calls.map(roleOf).slice(-3), ["combiner", "critic", "writer"]);
  assert.ok(calls.find((c) => roleOf(c) === "critic").messages[0].content.includes("COMBINER"));
  const writerInput = calls.find((c) => roleOf(c) === "writer").messages[0].content;
  assert.ok(writerInput.includes("CRITIC"));
  assert.ok(writerInput.includes("COMBINER"), "the writer still sees the combined answer, not only the critic's notes");
  assert.deepEqual(events.filter((e) => e.type === "handoff").map((e) => `${e.from}>${e.to}`).slice(-2), ["combiner>critic", "critic>writer"]);
});

test("a sequential critic with addToPrevious passes on the previous text and its own notes", async () => {
  const design = {
    pattern: "sequential",
    nodes: [node("researcher", "researcher"), node("critic", "critic", { addToPrevious: true }), node("writer", "writer")],
    edges: [edge("researcher", "critic"), edge("critic", "writer")],
  };
  const { call, calls } = byRole({ researcher: "FACTS-TEXT", critic: "NOTES-TEXT", writer: "FINAL-TEXT" });
  const { result } = await run(design, call);
  assert.equal(result.outcome, "finished");
  const writerInput = calls.find((c) => roleOf(c.body) === "writer").body.messages[0].content;
  assert.ok(writerInput.includes("FACTS-TEXT") && writerInput.includes("NOTES-TEXT"));
  // as the last agent, the critic's result is the previous text followed by its notes
  const last = { ...design, nodes: [design.nodes[0], design.nodes[1]], edges: [design.edges[0]] };
  const second = await run(last, byRole({ researcher: "FACTS-TEXT", critic: "NOTES-TEXT" }).call);
  assert.ok(second.result.finalText.startsWith("FACTS-TEXT") && second.result.finalText.endsWith("NOTES-TEXT"));
  // without the option only the critic's notes are passed on
  const plain = structuredClone(design);
  delete plain.nodes[1].addToPrevious;
  const third = byRole({ researcher: "FACTS-TEXT", critic: "NOTES-TEXT", writer: "FINAL-TEXT" });
  await run(plain, third.call);
  const plainInput = third.calls.find((c) => roleOf(c.body) === "writer").body.messages[0].content;
  assert.ok(plainInput.includes("NOTES-TEXT") && !plainInput.includes("FACTS-TEXT"));
});

test("a critic after the combiner with addToPrevious adds its notes to the combined answer", async () => {
  const design = fan();
  design.nodes.push(node("critic", "critic", { addToPrevious: true }), node("writer", "writer"));
  design.edges.push(edge("combiner", "critic"), edge("critic", "writer"));
  const { call, calls } = byRole({ combiner: "COMBINED-TEXT", critic: "NOTES-TEXT", writer: "FINAL-TEXT" });
  await run(design, call);
  const writerInput = calls.find((c) => roleOf(c.body) === "writer").body.messages[0].content;
  assert.ok(writerInput.includes("COMBINED-TEXT") && writerInput.includes("NOTES-TEXT"));
});

test("an invalid design fails at once and calls nothing", async () => {
  let calls = 0;
  const { result, events } = await run({ pattern: "sequential", nodes: [], edges: [] }, async () => {
    calls += 1;
  });
  assert.equal(result.outcome, "failed");
  assert.equal(calls, 0);
  assert.equal(events.filter((e) => e.type === "error").length, 1);
  assert.equal(doneEvents(events).length, 1);
  assert.equal(doneEvents(events)[0].outcome, "failed");
});

test("a token limit hit during parallel work stops the run and cancels the rest", async () => {
  const signals = [];
  const resolvers = [];
  const call = (body, opts) => {
    signals.push(opts.signal);
    return new Promise((resolve, reject) => {
      opts.signal.addEventListener("abort", () => reject(new AnthropicError("The request was cancelled")));
      resolvers.push(resolve);
    });
  };
  const design = {
    pattern: "parallel",
    nodes: [node("a", "researcher"), node("b", "researcher"), node("c", "researcher"), node("combiner", "combiner")],
    edges: [edge("a", "combiner"), edge("b", "combiner"), edge("c", "combiner")],
  };
  const events = [];
  const promise = runDesign({ design, task: "t", limits: { ...LIMIT_DEFAULTS, maxTokens: 100 }, call, emit: (e) => events.push(e) });
  await flush();
  assert.equal(resolvers.length, 3);
  resolvers[0](reply("big", usage(500, 500)));
  const result = await promise;
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "tokens");
  assert.ok(signals.slice(1).every((s) => s.aborted));
  assert.equal(doneEvents(events).length, 1);
  assert.equal(doneEvents(events)[0].reason, "tokens");
});

test("aborting the signal ends the run as stopped by the visitor", async () => {
  const controller = new AbortController();
  const call = (body, opts) =>
    new Promise((resolve, reject) => {
      opts.signal.addEventListener("abort", () => reject(new AnthropicError("The request was cancelled")));
    });
  const events = [];
  const promise = runDesign({ design: chain(), task: "t", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), signal: controller.signal });
  await flush();
  controller.abort();
  const result = await promise;
  assert.equal(result.outcome, "stopped_user");
  assert.equal(doneEvents(events).length, 1);
  assert.deepEqual(doneEvents(events)[0].usage, { input: 0, output: 0, searches: 0, steps: 1 });
});

test("a provider error ends the run as failed with an error event", async () => {
  const call = async () => {
    throw new AnthropicError("bad request sk-ant-api03-LEAKLEAK", { status: 400 });
  };
  const { result, events } = await run(chain(), call);
  assert.equal(result.outcome, "failed");
  const error = events.find((e) => e.type === "error");
  assert.ok(error && !error.message.includes("LEAKLEAK"));
  assert.equal(doneEvents(events).length, 1);
  assert.equal(doneEvents(events)[0].outcome, "failed");
});

test("the step limit stops a run", async () => {
  const { call } = byRole({});
  const { result } = await run(chain(), call, { limits: { ...LIMIT_DEFAULTS, maxSteps: 2 } });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "steps");
});
