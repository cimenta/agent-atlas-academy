import { test } from "node:test";
import assert from "node:assert/strict";
import { validateDesign } from "../public/js/engine/patterns.js";
import { AGENT_LIMIT_KEYS, agentLimitRange, cleanNodeLimits, validNodeLimits } from "../public/js/engine/agent-limits.js";
import { createBudget, LimitError, AgentLimitError } from "../public/js/engine/budget.js";
import { createAgent } from "../public/js/engine/agent.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { limitMessage } from "../public/js/engine/harness.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { createEditor } from "../public/js/create/editor-model.js";
import { loadDefinition, buildDefinition } from "../public/js/create/definition.js";

const reply = (text, stop = "end_turn", usage = { input_tokens: 10, output_tokens: 5 }) => ({ content: [{ type: "text", text }], stop_reason: stop, usage });
const design = (extra = {}) => ({
  pattern: "sequential",
  nodes: [
    { id: "planner", agent: "planner", model: "fast", search: false, ...extra },
    { id: "writer", agent: "writer", model: "fast", search: false },
  ],
  edges: [{ from: "planner", to: "writer" }],
});
const codes = (d) => validateDesign(d).errors.map((e) => e.code);

test("the agent limit keys and their ranges", () => {
  assert.deepEqual(AGENT_LIMIT_KEYS, ["maxSteps", "maxTokens", "maxOutputTokens", "maxSearches"]);
  assert.deepEqual(agentLimitRange("maxSteps"), { min: 1, max: 60 });
  assert.deepEqual(agentLimitRange("maxTokens"), { min: 1000, max: 150000 });
  assert.deepEqual(agentLimitRange("maxOutputTokens"), { min: 1000, max: 4000 });
  assert.deepEqual(agentLimitRange("maxSearches"), { min: 0, max: 10 });
});

test("validNodeLimits accepts whole numbers in range and nothing else", () => {
  assert.equal(validNodeLimits({}), true);
  assert.equal(validNodeLimits({ maxSteps: 4, maxTokens: 12000, maxOutputTokens: 2000, maxSearches: 0 }), true);
  assert.equal(validNodeLimits({ maxSteps: 0 }), false);
  assert.equal(validNodeLimits({ maxSteps: 61 }), false);
  assert.equal(validNodeLimits({ maxSteps: 2.5 }), false);
  assert.equal(validNodeLimits({ maxTokens: 999 }), false);
  assert.equal(validNodeLimits({ maxOutputTokens: 5000 }), false);
  assert.equal(validNodeLimits({ maxSearches: 11 }), false);
  assert.equal(validNodeLimits({ maxSteps: "4" }), false);
  assert.equal(validNodeLimits({ surprise: 1 }), false);
  assert.equal(validNodeLimits(null), false);
  assert.equal(validNodeLimits([]), false);
});

test("cleanNodeLimits keeps what is valid, clamps it, and returns undefined when nothing is left", () => {
  assert.deepEqual(cleanNodeLimits({ maxSteps: 4.7, maxTokens: 50, maxOutputTokens: 9000, maxSearches: -1, other: 1 }), { maxSteps: 5, maxTokens: 1000, maxOutputTokens: 4000, maxSearches: 0 });
  assert.deepEqual(cleanNodeLimits({ maxSteps: 3, maxTokens: "", maxSearches: null }), { maxSteps: 3 });
  assert.equal(cleanNodeLimits({}), undefined);
  assert.equal(cleanNodeLimits("x"), undefined);
});

test("validateDesign checks the limits and onLimit of a node", () => {
  assert.deepEqual(codes(design({ limits: { maxSteps: 4 }, onLimit: "pass" })), []);
  assert.deepEqual(codes(design({ onLimit: "stop" })), []);
  assert.ok(codes(design({ limits: { maxSteps: 0 } })).includes("node.limits"));
  assert.ok(codes(design({ limits: { nope: 1 } })).includes("node.limits"));
  assert.ok(codes(design({ limits: "x" })).includes("node.limits"));
  assert.ok(codes(design({ onLimit: "explode" })).includes("node.onLimit"));
});

test("an agent view refuses a step over its limit without charging the run", () => {
  const run = createBudget(LIMIT_DEFAULTS);
  const mine = run.forAgent({ maxSteps: 2 });
  mine.chargeStep();
  mine.chargeStep();
  assert.throws(() => mine.chargeStep(), (e) => e instanceof AgentLimitError && e.reason === "steps");
  assert.equal(run.usage().steps, 2);
});

test("an agent view counts tokens and searches of its own and also charges the run", () => {
  const run = createBudget(LIMIT_DEFAULTS);
  const mine = run.forAgent({ maxTokens: 1000, maxSearches: 1 });
  const other = run.forAgent({});
  mine.chargeUsage({ input: 400, output: 100, searches: 1 });
  other.chargeUsage({ input: 5000, output: 0, searches: 0 });
  assert.deepEqual(run.usage(), { input: 5400, output: 100, searches: 1, steps: 0 });
  assert.equal(mine.remainingTokens(), 500);
  assert.equal(mine.remainingSearches(), 0);
  assert.throws(() => mine.chargeUsage({ input: 600, output: 0 }), (e) => e instanceof AgentLimitError && e.reason === "tokens");
  assert.throws(() => run.forAgent({ maxSearches: 1 }).chargeUsage({ searches: 2 }), (e) => e instanceof AgentLimitError && e.reason === "searches");
});

test("an agent view never gives more than the run has left", () => {
  const run = createBudget({ ...LIMIT_DEFAULTS, maxTokens: 2000, maxSearches: 1 });
  const mine = run.forAgent({ maxTokens: 150000, maxSearches: 10 });
  assert.equal(mine.remainingTokens(), 2000);
  assert.equal(mine.remainingSearches(), 1);
  assert.throws(() => mine.chargeUsage({ input: 3000 }), (e) => e instanceof LimitError && !(e instanceof AgentLimitError));
});

function agentWith(nodeExtra, replies, budgetLimits = LIMIT_DEFAULTS) {
  const calls = [];
  const events = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    return replies.shift();
  };
  const budget = createBudget(budgetLimits);
  const agent = createAgent({ node: { id: "critic", agent: "critic", model: "fast", search: false, ...nodeExtra }, call, emit: (e) => events.push(e), budget, language: "en", sleep: async () => {} });
  return { agent, calls, events, budget };
}

test("an agent caps one reply at its own output tokens, never above the run's", async () => {
  const { agent, calls } = agentWith({ limits: { maxOutputTokens: 1500 } }, [reply("x")]);
  await agent.run("t");
  assert.equal(calls[0].max_tokens, 1500);
});

test("stop: an agent that passes its step limit stops the whole run with a limit error", async () => {
  const { agent } = agentWith({ limits: { maxSteps: 1 }, onLimit: "stop" }, [reply("part", "pause_turn"), reply("rest")]);
  await assert.rejects(agent.run("t"), (e) => e instanceof LimitError && e.reason === "agent_steps" && e.agent === "critic" && e.value === 1);
});

test("the default is stop", async () => {
  const { agent } = agentWith({ limits: { maxSteps: 1 } }, [reply("part", "pause_turn"), reply("rest")]);
  await assert.rejects(agent.run("t"), (e) => e instanceof LimitError && e.reason === "agent_steps");
});

test("pass: the agent hands on what it wrote, with a warning, and the run goes on", async () => {
  const { agent, events, budget } = agentWith({ limits: { maxSteps: 1 }, onLimit: "pass" }, [reply("part", "pause_turn"), reply("rest")]);
  const result = await agent.run("t");
  assert.equal(result.text, "part");
  const warning = events.find((e) => e.type === "warning");
  assert.equal(warning.agent, "critic");
  assert.equal(warning.limit, "agent_steps");
  assert.match(warning.message, /steps.*1 per agent/i);
  assert.deepEqual(events.at(-1), { type: "agent_output", agent: "critic", text: "part", tokens: { input: 10, output: 5 } });
  assert.equal(budget.usage().steps, 1);
});

test("pass: tokens over the agent limit after a reply keep that reply", async () => {
  const { agent, events } = agentWith({ limits: { maxTokens: 1000 }, onLimit: "pass" }, [reply("long answer", "end_turn", { input_tokens: 900, output_tokens: 400 })]);
  const result = await agent.run("t");
  assert.equal(result.text, "long answer");
  assert.equal(events.find((e) => e.type === "warning").limit, "agent_tokens");
});

test("stop: tokens over the agent limit stop the run", async () => {
  const { agent } = agentWith({ limits: { maxTokens: 1000 } }, [reply("long answer", "end_turn", { input_tokens: 900, output_tokens: 400 })]);
  await assert.rejects(agent.run("t"), (e) => e instanceof LimitError && e.reason === "agent_tokens");
});

test("pass: an agent that reaches its limit before it wrote anything fails and says so", async () => {
  const { agent } = agentWith({ limits: { maxSteps: 1 }, onLimit: "pass" }, [reply("one"), reply("two")]);
  await agent.run("first");
  await assert.rejects(agent.run("second"), /reached its own limit.*before it wrote anything/i);
});

test("a run stopped by an agent limit says which agent and which limit", async () => {
  const events = [];
  const call = async () => reply("part", "pause_turn");
  const result = await runDesign({ design: design({ limits: { maxSteps: 2 } }), task: "t", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "agent_steps");
  const warning = events.find((e) => e.type === "warning" && e.limit === "agent_steps");
  assert.equal(warning.agent, "planner");
  assert.equal(events.at(-2), warning);
  assert.equal(events.at(-1).type, "done");
});

test("the limit message names the agent and its own value", () => {
  assert.equal(limitMessage("agent_steps", LIMIT_DEFAULTS, { label: "Planner", value: 4 }), "Limit reached: steps of agent Planner (4 per agent). The run was stopped before it could finish. Raise the limit of this agent in the editor, and run again.");
  assert.match(limitMessage("agent_tokens", LIMIT_DEFAULTS, { label: "Planner", value: 12000 }), /tokens of agent Planner \(12000 per agent\)/);
  assert.match(limitMessage("agent_searches", LIMIT_DEFAULTS, { label: "Planner", value: 2 }), /web searches of agent Planner \(2 per agent\)/);
});

test("the editor keeps the limits and onLimit of a node and cleans them", () => {
  const editor = createEditor("sequential");
  const { id } = editor.addNode("planner");
  editor.setNode(id, { limits: { maxSteps: 3, maxTokens: 50 }, onLimit: "pass" });
  const node = editor.design().nodes[0];
  assert.deepEqual(node.limits, { maxSteps: 3, maxTokens: 1000 });
  assert.equal(node.onLimit, "pass");
  editor.setNode(id, { limits: {}, onLimit: "stop" });
  const cleared = editor.design().nodes[0];
  assert.equal("limits" in cleared, false);
  assert.equal("onLimit" in cleared, false);
  assert.deepEqual(editor.errors(), []);
});

test("a saved definition keeps the limits and onLimit of its agents", () => {
  const editor = createEditor("sequential");
  const a = editor.addNode("planner");
  const b = editor.addNode("writer");
  editor.connect(a.id, b.id);
  editor.setNode(a.id, { limits: { maxSteps: 4, maxSearches: 2 }, onLimit: "pass" });
  const text = JSON.stringify(buildDefinition({ task: "t", design: editor.design() }));
  const loaded = loadDefinition(text);
  assert.equal(loaded.ok, true);
  const node = loaded.editor.design().nodes[0];
  assert.deepEqual(node.limits, { maxSteps: 4, maxSearches: 2 });
  assert.equal(node.onLimit, "pass");
});
