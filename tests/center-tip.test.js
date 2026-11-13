import test from "node:test";
import assert from "node:assert/strict";
import { dragPosition } from "../public/js/center-tip.js";

const base = { grab: { x: 10, y: 5 }, size: { width: 300, height: 100 }, viewport: { width: 1000, height: 600 } };

test("the tip follows the pointer by where it was grabbed", () => {
  assert.deepEqual(dragPosition({ ...base, pointer: { x: 210, y: 105 } }), { left: 200, top: 100 });
});

test("the tip cannot be dragged out of the window", () => {
  assert.deepEqual(dragPosition({ ...base, pointer: { x: -50, y: -50 } }), { left: 0, top: 0 });
  assert.deepEqual(dragPosition({ ...base, pointer: { x: 5000, y: 5000 } }), { left: 700, top: 500 });
});

test("a window smaller than the tip pins it to the corner", () => {
  assert.deepEqual(dragPosition({ ...base, viewport: { width: 200, height: 50 }, pointer: { x: 90, y: 90 } }), { left: 0, top: 0 });
});
