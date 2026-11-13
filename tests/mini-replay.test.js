import test from "node:test";
import assert from "node:assert/strict";
import { miniStatuses, miniStepNumber } from "../public/js/mini-replay.js";

test("the agents wake up one after the other and then the loop starts again", () => {
  assert.deepEqual(miniStatuses(0), ["working", "waiting", "waiting"]);
  assert.deepEqual(miniStatuses(2), ["done", "working", "waiting"]);
  assert.deepEqual(miniStatuses(5), ["done", "done", "working"]);
  assert.deepEqual(miniStatuses(6), ["done", "done", "done"]);
  assert.deepEqual(miniStatuses(8), miniStatuses(0));
});

test("the step number stays between 1 and 6", () => {
  for (let tick = 0; tick < 20; tick++) {
    const step = miniStepNumber(tick);
    assert.ok(step >= 1 && step <= 6);
  }
});
