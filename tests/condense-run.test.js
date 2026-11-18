import test from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { CONDENSE_HEADING } from "../public/js/engine/condense.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "strong", search: false, ...extra });
const text = (t, usage = { input_tokens: 10, output_tokens: 5 }) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage });
const chain = (nodes) => ({ pattern: "sequential", nodes, edges: nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id })) });
const LONG = "Long finding. ".repeat(150);
const isCondense = (body) => String(body.system).startsWith("You shorten text");

async function run(d, { limits = LIMIT_DEFAULTS, replies = {}, condenseUsage = { input_tokens: 700, output_tokens: 20 }, summary = "Short summary.", ...options } = {}) {
  const events = [];
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    if (isCondense(body)) return text(summary, condenseUsage);
    const role = /^Role: (\w+)/.exec(body.system)[1];
    return text(replies[role] ?? (role === "researcher" ? LONG : "ok"));
  };
  const result = await runDesign({ design: d, task: "Compare", limits, call, emit: (e) => events.push(e), ...options });
  return { result, events, calls };
}
const agentCall = (calls, role) => calls.find((c) => c.system.startsWith(`Role: ${role}`));

test("an agent that condenses reads a short summary instead of a long answer, and the event says so", async () => {
  const { result, events, calls } = await run(chain([node("a", "researcher"), node("b", "writer", { condense: true })]));
  assert.equal(result.outcome, "finished");
  const seen = agentCall(calls, "writer").messages.at(-1).content;
  assert.equal(seen, `Task: Compare

${CONDENSE_HEADING}
Short summary.`);
  const e = events.find((x) => x.type === "condense");
  assert.equal(e.agent, "b");
  assert.ok(e.from > LONG.trim().length && e.material.endsWith(LONG.trim()));
  assert.equal(e.from, e.material.length);
  assert.equal(e.to, "Short summary.".length);
  assert.equal(e.text, "Short summary.");
    assert.deepEqual(e.usage, { input: 700, output: 20 });
  assert.match(calls.find(isCondense).model, /./);
});

test("the condensing call uses the fast model, whatever model the agent has", async () => {
  const { calls } = await run(chain([node("a", "researcher"), node("b", "writer", { condense: true, model: "strong" })]));
  assert.notEqual(calls.find(isCondense).model, agentCall(calls, "writer").model);
});

test("short material, the task alone, a node without the property and a decision agent are not touched", async () => {
  const short = await run(chain([node("a", "researcher"), node("b", "writer", { condense: true })]), { replies: { researcher: "Short." } });
  assert.equal(short.events.filter((e) => e.type === "condense").length, 0);
  assert.equal(short.calls.filter(isCondense).length, 0);
  const off = await run(chain([node("a", "researcher"), node("b", "writer")]));
  assert.equal(off.calls.filter(isCondense).length, 0);
  assert.equal(agentCall(off.calls, "writer").messages.at(-1).content.includes("Long finding."), true);
  const first = await run(chain([node("a", "researcher", { condense: true }), node("b", "writer")]));
  assert.equal(first.calls.filter(isCondense).length, 0);
});

test("condensing is a step and its tokens are charged to the run", async () => {
  const plain = await run(chain([node("a", "researcher"), node("b", "writer")]));
  const cond = await run(chain([node("a", "researcher"), node("b", "writer", { condense: true })]));
  assert.equal(cond.result.usage.steps, plain.result.usage.steps + 1);
  assert.equal(cond.result.usage.input, plain.result.usage.input + 700);
});

test("a step limit reached by the condensing call ends the run like any limit", async () => {
  const { result, events } = await run(chain([node("a", "researcher"), node("b", "writer", { condense: true })]), { limits: { ...LIMIT_DEFAULTS, maxSteps: 1 } });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(events.filter((e) => e.type === "condense").length, 0);
});

test("a resumed agent does not condense again", async () => {
  const d = chain([node("a", "researcher"), node("b", "writer", { condense: true })]);
  const first = await run(d);
  const resume = first.events.filter((e) => e.type === "agent_output").map((e) => ({ agent: e.agent, text: e.text, tokens: e.tokens }));
  const again = await run(d, { resume });
  assert.equal(again.calls.length, 0);
  assert.equal(again.events.filter((e) => e.type === "condense").length, 0);
});

import { buildResultModel } from "../public/js/play-model.js";
import { createAgent } from "../public/js/engine/agent.js";
import { createBudget } from "../public/js/engine/budget.js";
import { createNotebook } from "../public/js/engine/notebook.js";
import { AnthropicError } from "../public/js/engine/anthropic.js";

test("review: the condense event is emitted before the tokens are charged, so a limit hit by the call still leaves a record", async () => {
  const { result, events } = await run(chain([node("a", "researcher"), node("b", "writer", { condense: true })]), { limits: { ...LIMIT_DEFAULTS, maxTokens: 3000 }, condenseUsage: { input_tokens: 5000, output_tokens: 20 } });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(events.filter((e) => e.type === "condense").length, 1);
});

test("review: a summary that is not shorter is not used, but the call is still recorded", async () => {
  const { events, calls } = await run(chain([node("a", "researcher"), node("b", "writer", { condense: true })]), { summary: "z".repeat(5000) });
  const e = events.find((x) => x.type === "condense");
  assert.equal(e.kept, false);
  assert.equal(agentCall(calls, "writer").messages.at(-1).content.includes("Long finding."), true);
});

test("review: the cost of the condensing call is part of the cost of the run", () => {
  const design = chain([node("a", "researcher"), node("b", "writer", { condense: true })]);
  const base = [{ type: "agent_output", agent: "a", text: "x", tokens: { input: 10, output: 5 } }, { type: "done", outcome: "finished", usage: { input: 10, output: 5, searches: 0 } }];
  const withCondense = [{ type: "condense", agent: "b", from: 3000, to: 100, text: "s", usage: { input: 1000000, output: 0 } }, ...base];
  const record = (events) => ({ design, events, recordedWith: { provider: "anthropic" } });
  assert.ok(buildResultModel(record(withCondense)).cost > buildResultModel(record(base)).cost + 0.5);
});

test("review: an agent without a split input does not wait before it reads the notebook", () => {
  let reads = 0;
  const book = createNotebook();
  const real = book.forReader;
  book.forReader = (o) => {
    reads += 1;
    return real(o);
  };
  const design = { pattern: "sequential", memory: { notebook: true }, nodes: [node("a", "writer")], edges: [] };
  const agent = createAgent({ node: node("a", "writer"), design, call: async () => text("ok"), emit: () => {}, budget: createBudget(LIMIT_DEFAULTS), notebook: book, task: "Compare" });
  agent.run("Task: Compare");
  assert.equal(reads, 1);
});

test("review: a resumed agent charges the condense step and reads the condensed text; one that failed after condensing does not call again", async () => {
  const d = chain([node("a", "researcher"), node("b", "writer", { condense: true })]);
  const fresh = await run(d);
  const e = fresh.events.find((x) => x.type === "condense");
  const outputs = fresh.events.filter((x) => x.type === "agent_output").map((x) => ({ agent: x.agent, text: x.text, tokens: x.tokens }));
  const rec = { from: e.from, to: e.to, text: e.text, usage: e.usage, kept: true };
  const done = await run(d, { resume: outputs.map((o) => (o.agent === "b" ? { ...o, condense: rec } : o)) });
  assert.equal(done.calls.length, 0);
  assert.equal(done.result.usage.steps, fresh.result.usage.steps);
  const pending = await run(d, { resume: [outputs[0], { agent: "b", pending: true, condense: rec }] });
  assert.equal(pending.calls.filter(isCondense).length, 0);
  assert.equal(pending.events.filter((x) => x.type === "condense").length, 0);
  assert.match(agentCall(pending.calls, "writer").messages.at(-1).content, /Short summary\./);
});

test("review: a failing condensing call does not fail the run or move the agent to the fallback model", async () => {
  const d = chain([node("a", "researcher"), node("b", "writer", { condense: true })]);
  const events = [];
  const call = async (body) => {
    if (isCondense(body)) throw new AnthropicError("busy", { status: 529, retryable: true });
    return text(/^Role: researcher/.test(body.system) ? LONG : "ok");
  };
  const result = await runDesign({ design: d, task: "Compare", limits: LIMIT_DEFAULTS, call, emit: (x) => events.push(x), retries: 0, retryDelaySec: 0, fallback: "auto" });
  assert.equal(result.outcome, "finished");
  assert.equal(events.some((x) => x.type === "warning" && x.fallback), false);
  assert.equal(events.some((x) => x.type === "warning" && x.condense === "failed"), true);
});

test("review: an agent with fewer than two steps of its own, or too few tokens, skips condensing with a warning", async () => {
  for (const limits of [{ maxSteps: 1 }, { maxTokens: 1000 }]) {
    const { result, events, calls } = await run(chain([node("a", "researcher"), node("b", "writer", { condense: true, limits })]));
    assert.equal(result.outcome, "finished", JSON.stringify(limits));
    assert.equal(calls.filter(isCondense).length, 0);
    assert.equal(events.some((x) => x.type === "warning" && x.condense === "skipped"), true);
  }
});

test("review: a supervisor instruction is never condensed", async () => {
  const d = { pattern: "supervisor", nodes: [node("s", "supervisor"), node("w", "writer", { condense: true })], edges: [{ from: "s", to: "w" }] };
  const replies = [JSON.stringify({ action: "call", worker: "w", instruction: "go ".repeat(800) }), "Done.", JSON.stringify({ action: "finish", answer: "ok" })];
  const calls = [];
  const call = async (body) => {
    calls.push(body);
    return text(replies.shift());
  };
  await runDesign({ design: d, task: "Compare", limits: LIMIT_DEFAULTS, call, emit: () => {} });
  assert.equal(calls.filter(isCondense).length, 0);
});
