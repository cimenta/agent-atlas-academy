import test from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const design = (nodes, extra = {}) => ({ pattern: "sequential", nodes, edges: nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id })), ...extra });
const chain = (modes, memory = { notebook: true }) => design([node("a", "researcher", { notebook: modes[0] }), node("b", "critic", { notebook: modes[1] }), node("c", "writer", { notebook: modes[2] })], memory ? { memory } : {});

// Each agent answers by its role; replies hold notes where the script says so.
const REPLIES = { researcher: "Facts.\n\n<note>A has 16 GB.</note>\n<note>B has 8 GB.</note>", critic: "Looks fine.\n<note>B price has no source.</note>", writer: "Final answer." };
async function run(d, options = {}) {
  const events = [];
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    const role = /^Role: (\w+)/.exec(body.system)[1];
    return text(REPLIES[role] ?? "x");
  };
  const result = await runDesign({ design: d, task: "Compare", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), ...options });
  return { result, events, calls };
}
const lastUser = (call) => call.messages.at(-1).content;
const byRole = (calls, role) => calls.find((c) => c.system.startsWith(`Role: ${role}`));

test("notes written by one agent reach the agents that read, and are taken out of the text that goes on", async () => {
  const { result, events, calls } = await run(chain(["write", "both", "read"]));
  assert.equal(result.outcome, "finished");
  assert.deepEqual(events.filter((e) => e.type === "note").map((e) => [e.agent, e.text, e.n]), [["a", "A has 16 GB.", 1], ["a", "B has 8 GB.", 2], ["b", "B price has no source.", 3]]);
  assert.match(lastUser(byRole(calls, "critic")), /Notebook:\n- a: A has 16 GB\.\n- a: B has 8 GB\.$/);
  assert.doesNotMatch(lastUser(byRole(calls, "critic")), /<note>/);
  assert.match(lastUser(byRole(calls, "writer")), /- b: B price has no source\.$/);
  assert.equal(result.finalText, "Final answer.");
});

test("the recorded agent_output keeps the whole reply, notes included", async () => {
  const { events } = await run(chain(["write", "both", "read"]));
  assert.match(events.find((e) => e.type === "agent_output" && e.agent === "a").text, /<note>A has 16 GB\.<\/note>/);
});

test("none, read and write decide what an agent may do; the system prompt follows", async () => {
  const { events, calls } = await run(chain(["none", "write", "read"]));
  assert.deepEqual(events.filter((e) => e.type === "note").map((e) => e.agent), ["b"]);
  assert.doesNotMatch(byRole(calls, "researcher").system, /Notebook|<note>/);
  assert.match(byRole(calls, "critic").system, /<note>/);
  assert.doesNotMatch(lastUser(byRole(calls, "critic")), /Notebook:/);
  assert.match(byRole(calls, "writer").system, /Notebook:/);
  assert.doesNotMatch(byRole(calls, "writer").system, /<note>/);
});

test("without the switch nothing changes, even when agents carry a choice", async () => {
  const { events, calls } = await run(chain(["both", "both", "both"], false));
  assert.equal(events.filter((e) => e.type === "note").length, 0);
  for (const c of calls) assert.doesNotMatch(c.system + lastUser(c), /Notebook/);
  for (const c of calls) assert.doesNotMatch(c.system, /<note>/);
});

test("a supervisor may read the notebook but a note in its reply is not taken", async () => {
  const d = {
    pattern: "supervisor",
    memory: { notebook: true },
    nodes: [node("s", "supervisor"), node("w", "researcher", { notebook: "write" })],
    edges: [{ from: "s", to: "w" }],
  };
  const replies = ['{"action":"call","worker":"w","instruction":"go"}', "Facts <note>seen</note>", '{"action":"finish","answer":"done"}'];
  const calls = [];
  const events = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    return text(replies.shift());
  };
  const result = await runDesign({ design: d, task: "t", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  assert.equal(result.outcome, "finished");
  assert.deepEqual(events.filter((e) => e.type === "note").map((e) => e.agent), ["w"]);
  assert.doesNotMatch(calls[0].system, /<note>/);
  assert.match(calls[0].system, /Notebook:/);
  assert.match(calls[2].messages.at(-1).content, /Notebook:\n- w: seen/);
});

test("a resumed run builds the same notebook without repeating the note events", async () => {
  const first = await run(chain(["write", "both", "read"]));
  const done = first.events.filter((e) => e.type === "agent_output").slice(0, 2).map((e) => ({ agent: e.agent, text: e.text, tokens: e.tokens }));
  const resumed = await run(chain(["write", "both", "read"]), { resume: done });
  assert.equal(resumed.events.filter((e) => e.type === "note").length, 0);
  assert.match(lastUser(byRole(resumed.calls, "writer")), /- a: A has 16 GB\.\n- a: B has 8 GB\.\n- b: B price has no source\.$/);
});

test("an agent that reaches its own limit with pass still has its notes taken out", async () => {
  const d = chain(["write", "read", "read"]);
  d.nodes[0].limits = { maxSteps: 1 };
  d.nodes[0].onLimit = "pass";
  const { result, events } = await run(d);
  assert.equal(result.outcome, "finished");
  assert.ok(events.filter((e) => e.type === "note").length >= 2);
});

test("the mock provider writes a note for an agent that may write and mentions the notes an agent read", async () => {
  const { createMockCall } = await import("../public/js/engine/mock-anthropic.js");
  const events = [];
  const result = await runDesign({ design: chain(["write", "both", "read"]), task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  assert.equal(result.outcome, "finished");
  assert.deepEqual(events.filter((e) => e.type === "note").map((e) => e.agent), ["a", "b"]);
  assert.match(events.find((e) => e.type === "agent_output" && e.agent === "c").text, /Used 2 notes from the notebook/);
  assert.doesNotMatch(result.finalText, /<note>/);
});

test("review: a truncated note never reaches the next agent", async () => {
  const saved = { ...REPLIES };
  REPLIES.researcher = "Facts.\n<note>cut off by max_tok";
  try {
    const { calls } = await run(chain(["write", "both", "read"]));
    assert.doesNotMatch(lastUser(byRole(calls, "critic")), /<note>|cut off/);
  } finally {
    Object.assign(REPLIES, saved);
  }
});

test("review: notes are taken before the repeat check, so a stopped run still shows them", async () => {
  const d = design([node("a", "writer", { notebook: "both" })], { memory: { notebook: true } });
  const events = [];
  const call = async () => text("Same.\n<note>n</note>");
  await runDesign({ design: d, task: "t", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), repeatStop: 1 }).catch(() => {});
  assert.equal(events.filter((e) => e.type === "note").length, 1);
});

test("review: a resumed run does not repeat the notebook warning", async () => {
  const big = "<note>" + "x".repeat(590) + "</note><note>" + "y".repeat(590) + "</note>";
  const nodes = Array.from({ length: 8 }, (_, i) => node("n" + i, "writer", { notebook: "both" }));
  const first = [];
  const call = async () => text("Done " + big);
  await runDesign({ design: design(nodes, { memory: { notebook: true } }), task: "t", limits: LIMIT_DEFAULTS, call, emit: (e) => first.push(e) });
  const warnings = first.filter((e) => e.type === "warning" && e.notebook).length;
  assert.equal(warnings, 1);
  const again = [];
  const resume = first.filter((e) => e.type === "agent_output").map((e) => ({ agent: e.agent, text: e.text, tokens: e.tokens }));
  await runDesign({ design: design(nodes, { memory: { notebook: true } }), task: "t", limits: LIMIT_DEFAULTS, call, emit: (e) => again.push(e), resume });
  assert.equal(again.filter((e) => e.type === "warning" && e.notebook).length, 0);
});
