import test from "node:test";
import assert from "node:assert/strict";
import { parsePartsReply } from "../public/js/engine/runners/mapreduce.js";
import { parseStepsReply } from "../public/js/engine/runners/planexec.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";
import { agentLabel } from "../public/js/engine/labels.js";
import { createSpawner, instanceId, nodeIdOf } from "../public/js/engine/spawn.js";

const PARTS = '{"parts":["one","two","three"]}';

test("parsePartsReply reads plain, fenced and brace-wrapped JSON", () => {
  const want = ["one", "two", "three"];
  assert.deepEqual(parsePartsReply(PARTS), want);
  assert.deepEqual(parsePartsReply("```json\n" + PARTS + "\n```"), want);
  assert.deepEqual(parsePartsReply("Here: " + PARTS + " ok"), want);
});

test("parsePartsReply takes two to six non-empty parts and nothing else", () => {
  assert.equal(parsePartsReply('{"parts":["only one"]}'), null);
  assert.equal(parsePartsReply('{"parts":[]}'), null);
  assert.equal(parsePartsReply('{"parts":["a","b","c","d","e","f","g"]}'), null);
  assert.equal(parsePartsReply('{"parts":["a","  "]}'), null);
  assert.equal(parsePartsReply('{"parts":["a",2]}'), null);
  assert.equal(parsePartsReply('{"parts":"a,b"}'), null);
  assert.equal(parsePartsReply('{"steps":["a","b"]}'), null);
  assert.equal(parsePartsReply('{"parts":["a","b","c","d","e","f"]}').length, 6);
  assert.equal(parsePartsReply('{"parts":["a","b"]}').length, 2);
  for (const bad of [undefined, null, 5, "", "  ", "parts", "[1]"]) assert.equal(parsePartsReply(bad), null, String(bad));
});

test("parsePartsReply trims the parts", () => {
  assert.deepEqual(parsePartsReply('{"parts":["  a ","b\\n"]}'), ["a", "b"]);
});

test("parseStepsReply reads the key steps with the same limits", () => {
  assert.deepEqual(parseStepsReply('{"steps":["find","write"]}'), ["find", "write"]);
  assert.equal(parseStepsReply('{"parts":["find","write"]}'), null);
  assert.equal(parseStepsReply('{"steps":["find"]}'), null);
  assert.equal(parseStepsReply('{"steps":["a","b","c","d","e","f","g"]}'), null);
});

test("the new roles name their role and their JSON answer", () => {
  assert.match(systemPromptFor({ id: "s", agent: "splitter" }), /^Role: splitter[\s\S]*"parts"/);
  assert.match(systemPromptFor({ id: "w", agent: "worker" }), /^Role: worker/);
  assert.match(systemPromptFor({ id: "r", agent: "reducer" }), /^Role: reducer/);
  assert.match(systemPromptFor({ id: "e", agent: "executor" }), /^Role: executor/);
  assert.match(systemPromptFor({ id: "p", agent: "planner" }, { pattern: "planexec" }), /^Role: planner[\s\S]*"steps"/);
  // the planner of the other patterns is unchanged
  assert.doesNotMatch(systemPromptFor({ id: "p", agent: "planner" }, { pattern: "sequential" }), /"steps"/);
});

test("an instance id and its node", () => {
  assert.equal(instanceId("worker", 3), "worker#3");
  assert.equal(nodeIdOf("worker#3"), "worker");
  assert.equal(nodeIdOf("worker"), "worker");
});

test("an instance is labelled with the label of its node and its number", () => {
  const design = { nodes: [{ id: "worker", agent: "worker" }] };
  assert.equal(agentLabel({ id: "worker#2", agent: "worker" }, design, "Worker"), "Worker 2");
  assert.equal(agentLabel({ id: "worker", agent: "worker" }, design, "Worker"), "Worker");
});

test("spawn makes an instance once, from the node, and gives back the same one", () => {
  const node = { id: "worker", agent: "worker", model: "fast", search: false, limits: { maxSteps: 3 } };
  const made = [];
  const spawn = createSpawner({ design: { nodes: [node] }, make: (n) => { made.push(n); return { id: n.id }; } });
  const first = spawn("worker", 1);
  assert.equal(first.id, "worker#1");
  assert.equal(spawn("worker", 1), first);
  assert.equal(spawn("worker", 2).id, "worker#2");
  assert.equal(made.length, 2);
  assert.equal(made[0].model, "fast");
  assert.deepEqual(made[0].limits, { maxSteps: 3 });
  assert.equal(made[0].agent, "worker");
});

test("spawn refuses an unknown node and a bad number", () => {
  const spawn = createSpawner({ design: { nodes: [{ id: "worker", agent: "worker" }] }, make: (n) => n });
  assert.throws(() => spawn("nope", 1));
  assert.throws(() => spawn("worker", 0));
  assert.throws(() => spawn("worker", 1.5));
});
