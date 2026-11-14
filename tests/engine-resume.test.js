import { test } from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";

const design = () => ({
  pattern: "sequential",
  nodes: [
    { id: "planner", agent: "planner", model: "fast", search: false },
    { id: "writer", agent: "writer", model: "fast", search: false },
  ],
  edges: [{ from: "planner", to: "writer" }],
});

function counting() {
  const bodies = [];
  const inner = createMockCall();
  return { bodies, call: async (body, options) => (bodies.push(body), inner(body, options)) };
}

test("a carried-on run answers a finished agent from its earlier answer and calls the provider for the rest", async () => {
  const { bodies, call } = counting();
  const events = [];
  const result = await runDesign({
    design: design(),
    task: "Why is the sky blue?",
    limits: {},
    call,
    emit: (e) => events.push(e),
    resume: [{ agent: "planner", text: "EARLIER PLAN", tokens: { input: 100, output: 50 } }],
  });
  assert.equal(result.outcome, "finished");
  // Only the writer called the provider, and it saw what the planner wrote before.
  assert.equal(bodies.length, 1);
  assert.ok(JSON.stringify(bodies[0].messages).includes("EARLIER PLAN"));
  // No run_start (the caller has it) and no events for the planner; the writer's events and the done event follow.
  assert.ok(!events.some((e) => e.type === "run_start"));
  assert.deepEqual(events.filter((e) => e.type === "agent_start").map((e) => e.agent), ["writer"]);
  assert.equal(events.at(-1).type, "done");
  // The earlier answer still counts against the limits.
  assert.ok(events.at(-1).usage.input >= 100 && events.at(-1).usage.steps >= 2);
});

test("without resume every agent runs and run_start is sent", async () => {
  const { bodies, call } = counting();
  const events = [];
  await runDesign({ design: design(), task: "Hi", limits: {}, call, emit: (e) => events.push(e) });
  assert.equal(bodies.length, 2);
  assert.equal(events[0].type, "run_start");
});
