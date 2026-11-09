import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveState } from "../public/js/replay/state.js";

const events = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample-run.json"), "utf8"),
).events;

const status = (state, id) => state.agents.find((a) => a.id === id).status;

test("at cursor 0 every agent is waiting and listed in order of first appearance", () => {
  const state = deriveState(events, 0);
  assert.deepEqual(
    state.agents.map((a) => a.id),
    ["planner", "researcher", "writer"],
  );
  assert.ok(state.agents.every((a) => a.status === "waiting"));
  assert.deepEqual(state.activeAgents, []);
  assert.equal(state.steps.length, 0);
  assert.equal(state.finished, false);
  assert.equal(state.error, null);
});

test("an agent works from its start until its output", () => {
  const afterStart = deriveState(events, 2);
  assert.equal(status(afterStart, "planner"), "working");
  assert.deepEqual(afterStart.activeAgents, ["planner"]);
  const afterOutput = deriveState(events, 3);
  assert.equal(status(afterOutput, "planner"), "done");
  assert.deepEqual(afterOutput.activeAgents, []);
  assert.equal(status(afterOutput, "researcher"), "waiting");
});

test("steps describe each applied event", () => {
  const state = deriveState(events, 7);
  assert.equal(state.steps.length, 7);
  assert.equal(state.steps[5].type, "tool_call");
  assert.equal(state.steps[5].agent, "researcher");
  assert.equal(state.steps[5].index, 5);
  assert.equal(state.steps[3].type, "handoff");
  assert.equal(state.steps[3].summary, "planner → researcher");
});

test("tokens add up the agent outputs seen so far", () => {
  assert.deepEqual(deriveState(events, 3).tokens, { input: 120, output: 40 });
  assert.deepEqual(deriveState(events, events.length).tokens, { input: 820, output: 150 });
  assert.deepEqual(deriveState(events, 1).tokens, { input: 0, output: 0 });
});

test("a done event finishes the run", () => {
  assert.equal(deriveState(events, events.length - 1).finished, false);
  assert.equal(deriveState(events, events.length).finished, true);
});

test("an error event sets the error message", () => {
  const withError = [...events.slice(0, 3), { t: 9000, type: "error", message: "Provider timed out" }];
  assert.equal(deriveState(withError, 3).error, null);
  assert.equal(deriveState(withError, 4).error, "Provider timed out");
});

test("a cursor outside the range is clamped", () => {
  assert.equal(deriveState(events, -4).steps.length, 0);
  assert.equal(deriveState(events, 999).steps.length, events.length);
});
