import test from "node:test";
import assert from "node:assert/strict";
import { createRegistry } from "../public/js/engine/created.js";
import { NAME_MAX, INSTRUCTIONS_MAX, NODE_MAX } from "../public/js/engine/catalog.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "balanced", search: false, ...extra });
function setup({ max = 2, search = false, extraNodes = [] } = {}) {
  const design = { pattern: "supervisor", nodes: [node("boss", "supervisor", { slot: "anthropic", creates: { max, guidance: "", search } }), node("w1", "researcher"), ...extraNodes], edges: [{ from: "boss", to: "w1" }] };
  const agents = new Map(design.nodes.map((n) => [n.id, { node: n }]));
  const events = [];
  const made = [];
  const registry = createRegistry({ design, agents, make: (n) => { made.push(n); return { node: n }; }, emit: (e) => events.push(e) });
  return { design, agents, events, made, registry };
}

test("a created agent is a Free agent with the model of its creator", () => {
  const { registry, agents, events, made } = setup();
  const result = registry.request({ by: "boss", name: "Fact checker", instructions: "Check each claim." });
  assert.equal(result.ok, true);
  assert.equal(result.id, "made-1");
  assert.deepEqual(result.node, { id: "made-1", agent: "free", name: "Fact checker", instructions: "Check each claim.", model: "balanced", slot: "anthropic", search: false, created: true, by: "boss" });
  assert.equal(agents.has("made-1"), true);
  assert.equal(made.length, 1);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], { type: "agent_created", by: "boss", agent: "made-1", node: result.node, n: 1, max: 2 });
  assert.equal(registry.used("boss"), 1);
  assert.equal(registry.list().length, 1);
});

test("created agents may search only when the setting allows it", () => {
  assert.equal(setup({ search: true }).registry.request({ by: "boss", name: "A", instructions: "B" }).node.search, true);
  assert.equal(setup({ search: false }).registry.request({ by: "boss", name: "A", instructions: "B" }).node.search, false);
});

const refused = (r, reason) => {
  const result = r.registry.request(reason.input);
  assert.equal(result.ok, false);
  assert.equal(result.reason, reason.code, JSON.stringify(reason.input));
  assert.equal(r.events.at(-1).type, "agent_refused");
  assert.equal(r.events.at(-1).reason, reason.code);
  assert.equal(r.events.at(-1).by, reason.input.by);
};

test("the requests that are refused, and why", () => {
  const ok = { by: "boss", name: "Fact checker", instructions: "Check." };
  refused(setup(), { code: "not-allowed", input: { ...ok, by: "w1" } });
  refused(setup(), { code: "not-allowed", input: { ...ok, by: "nobody" } });
  refused(setup(), { code: "name", input: { ...ok, name: "   " } });
  refused(setup(), { code: "name", input: { ...ok, name: "x".repeat(NAME_MAX + 1) } });
  refused(setup(), { code: "name", input: { ...ok, name: 5 } });
  refused(setup(), { code: "instructions", input: { ...ok, instructions: "" } });
  refused(setup(), { code: "instructions", input: { ...ok, instructions: "x".repeat(INSTRUCTIONS_MAX + 1) } });
  refused(setup(), { code: "name-taken", input: { ...ok, name: "RESEARCHER" } });
  refused(setup(), { code: "name-taken", input: { ...ok, name: " supervisor " } });
});

test("a name that is taken by a created agent is refused, ignoring capitals", () => {
  const r = setup();
  assert.equal(r.registry.request({ by: "boss", name: "Editor", instructions: "Edit." }).ok, true);
  refused(r, { code: "name-taken", input: { by: "boss", name: "editor", instructions: "Edit." } });
});

test("the cap is the number the student allowed", () => {
  const r = setup({ max: 1 });
  assert.equal(r.registry.request({ by: "boss", name: "A", instructions: "x" }).ok, true);
  refused(r, { code: "cap", input: { by: "boss", name: "B", instructions: "x" } });
  assert.equal(r.registry.used("boss"), 1);
  assert.equal(r.agents.size, 3);
});

test("a created agent cannot create agents", () => {
  const r = setup();
  const made = r.registry.request({ by: "boss", name: "A", instructions: "x" });
  assert.equal(made.node.creates, undefined);
  refused(r, { code: "not-allowed", input: { by: made.id, name: "B", instructions: "x" } });
});

test("the run never holds more than the limit of agents", () => {
  const extra = Array.from({ length: NODE_MAX - 3 }, (_, i) => node(`e${i}`, "researcher"));
  const r = setup({ max: 1, extraNodes: extra });
  assert.equal(r.design.nodes.length, NODE_MAX - 1);
  assert.equal(r.registry.request({ by: "boss", name: "A", instructions: "x" }).ok, true);
  // Pretend the student allowed more than the room (an old or hand-made design): the room still decides.
  r.design.nodes[0].creates.max = 4;
  refused(r, { code: "total", input: { by: "boss", name: "B", instructions: "x" } });
});
