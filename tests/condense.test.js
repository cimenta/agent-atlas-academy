import test from "node:test";
import assert from "node:assert/strict";
import { splitInput, mayCondense, condenseInstruction, condensedInput, CONDENSE_MIN, CONDENSE_HEADING } from "../public/js/engine/condense.js";

const long = "x".repeat(CONDENSE_MIN + 1);

test("splitInput finds the material after the task, and only when it is longer than the limit", () => {
  assert.deepEqual(splitInput(`Task: Compare\n\n${long}`, "Compare"), { head: "Task: Compare\n\n", material: long, tail: "" });
  assert.equal(splitInput(`Task: Compare\n\n${"x".repeat(CONDENSE_MIN)}`, "Compare"), null);
  assert.equal(splitInput("Task: Compare", "Compare"), null);
});

test("splitInput leaves any other input alone", () => {
  assert.equal(splitInput(`Compare\n\n${long}`, "Compare"), null);
  assert.equal(splitInput(`Task: Other\n\n${long}`, "Compare"), null);
  assert.equal(splitInput(`Task: Compare and more\n\n${long}`, "Compare"), null);
  assert.equal(splitInput(undefined, "Compare"), null);
  assert.equal(splitInput(`Task: Compare\n\n${long}`, undefined), null);
});

test("review: a trailing one-line instruction stays outside the material, and a supervisor instruction is not material", () => {
  const out = splitInput(`Task: Compare\n\nThe debate so far:\n${long}\n\nGive your argument now.`, "Compare");
  assert.equal(out.tail, "Give your argument now.");
  assert.equal(out.material.endsWith("Give your argument now."), false);
  assert.equal(condensedInput(out.head, "S", out.tail), `Task: Compare\n\n${CONDENSE_HEADING}\nS\n\nGive your argument now.`);
  assert.equal(splitInput(`Task: Compare\n\nInstruction from the supervisor:\n${long}`, "Compare"), null);
  assert.equal(splitInput(`Task: Compare\n\nYour last draft:\n${long}`, "Compare"), null);
});

test("review: no condensing in a handoff or an evaluator loop", () => {
  assert.equal(mayCondense("writer", "handoff"), false);
  assert.equal(mayCondense("writer", "evaluator"), false);
  assert.equal(mayCondense("writer", "sequential"), true);
});

test("agents whose reply is a decision may not condense; the rest may", () => {
  for (const a of ["supervisor", "evaluator", "router", "tally"]) assert.equal(mayCondense(a), false);
  for (const a of ["writer", "critic", "researcher", "debater", "judge", "free"]) assert.equal(mayCondense(a), true);
});

test("the instruction names the word limit and the language; the new input keeps the task head", () => {
  assert.match(condenseInstruction("en"), /150 words.*English/);
  assert.match(condenseInstruction("cs"), /Czech/);
  assert.equal(condensedInput("Task: T\n\n", "short"), `Task: T\n\n${CONDENSE_HEADING}\nshort`);
});
