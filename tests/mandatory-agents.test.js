import test from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "../public/js/create/editor-model.js";

const agentsAfterReset = (pattern) => {
  const e = createEditor("sequential");
  e.reset(pattern);
  return e.design().nodes.map((n) => n.agent);
};

test("a pattern with one mandatory agent starts with it in the diagram", () => {
  assert.deepEqual(agentsAfterReset("parallel"), ["combiner"]);
  assert.deepEqual(agentsAfterReset("supervisor"), ["supervisor"]);
  assert.deepEqual(agentsAfterReset("debate"), ["judge"]);
});

test("patterns without a mandatory agent still start empty", () => {
  assert.deepEqual(agentsAfterReset("sequential"), []);
  assert.deepEqual(agentsAfterReset("handoff"), []);
});

test("patterns that already started with their agents keep doing so", () => {
  assert.deepEqual(agentsAfterReset("router"), ["router"]);
  assert.deepEqual(agentsAfterReset("voting"), ["tally"]);
  assert.deepEqual(agentsAfterReset("mapreduce"), ["splitter", "worker", "reducer"]);
  assert.deepEqual(agentsAfterReset("planexec"), ["planner", "executor"]);
  assert.deepEqual(agentsAfterReset("evaluator"), ["writer", "evaluator"]);
});

test("the mandatory agent is placed once, after a second reset too", () => {
  const e = createEditor("sequential");
  e.reset("supervisor");
  e.reset("supervisor");
  assert.deepEqual(e.design().nodes.map((n) => n.agent), ["supervisor"]);
});

import { isUntouched } from "../public/js/create/editor-model.js";

test("a diagram that only holds the agents placed for the pattern counts as untouched", () => {
  const e = createEditor("sequential");
  e.reset("supervisor");
  assert.equal(isUntouched(e.design()), true);
  e.addNode("researcher");
  assert.equal(isUntouched(e.design()), false);
});

test("a fresh empty diagram is untouched and a connected one is not", () => {
  const e = createEditor("sequential");
  assert.equal(isUntouched(e.design()), true);
  const a = e.addNode("planner").id;
  const b = e.addNode("writer").id;
  e.connect(a, b);
  assert.equal(isUntouched(e.design()), false);
});
