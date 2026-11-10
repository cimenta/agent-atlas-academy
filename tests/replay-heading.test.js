import { test } from "node:test";
import assert from "node:assert/strict";
import { headingOf } from "../public/js/replay/view.js";

const run = (task, title = "Sample sequential run") => ({ title, events: [{ t: 0, type: "run_start", task }, { t: 1, type: "done" }] });

test("the heading of a replay is the task the run was given", () => {
  assert.equal(headingOf(run("Explain why the sky is blue.")), "Explain why the sky is blue.");
});

test("only the first line of the task is used", () => {
  assert.equal(headingOf(run("First line\nsecond line")), "First line");
});

test("a very long task is cut with an ellipsis", () => {
  const heading = headingOf(run("x".repeat(300)));
  assert.equal(heading.length, 118);
  assert.ok(heading.endsWith("…"));
});

test("a run without a task falls back to its title", () => {
  assert.equal(headingOf({ title: "Fallback", events: [{ t: 0, type: "done" }] }), "Fallback");
  assert.equal(headingOf(run("   ", "Fallback")), "Fallback");
});
