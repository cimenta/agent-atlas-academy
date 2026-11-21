import { test } from "node:test";
import assert from "node:assert/strict";
import { autoPositions, arrowsOf, extentOf, maxColsFor, CELL_W, BOX_H } from "../public/js/create/diagram-geometry.js";

const chain = (n) => ({
  pattern: "sequential",
  nodes: Array.from({ length: n }, (_, i) => ({ id: `a${i}`, agent: "free" })),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ from: `a${i}`, to: `a${i + 1}` })),
});

test("a chain of eight goes on in a second row, four and four, when only six boxes fit", () => {
  const pos = autoPositions(chain(8), { wide: true, maxCols: 6 });
  const rows = new Set([...pos.values()].map((p) => p.y));
  assert.equal(rows.size, 2);
  assert.equal(pos.get("a3").y, pos.get("a0").y);
  assert.ok(pos.get("a4").y > pos.get("a3").y);
  assert.equal(pos.get("a4").x, pos.get("a0").x);
});

test("a chain that fits keeps one row, and a phone chain stays one column", () => {
  const one = autoPositions(chain(5), { wide: true, maxCols: 6 });
  assert.equal(new Set([...one.values()].map((p) => p.y)).size, 1);
  const phone = autoPositions(chain(8), { wide: false, maxCols: 2 });
  assert.equal(new Set([...phone.values()].map((p) => p.x)).size, 1);
});

test("the extent of a wrapped chain is not wider than the room", () => {
  const pos = autoPositions(chain(8), { wide: true, maxCols: 5 });
  assert.ok(extentOf(pos).width <= 4 * CELL_W + 24 + 2 * CELL_W);
});

test("the arrow that goes on in the next row leaves under the last box and enters the top of the first", () => {
  const design = chain(8);
  const pos = autoPositions(design, { wide: true, maxCols: 6 });
  const arrow = arrowsOf(design, pos).find((a) => a.key === "a3>a4");
  assert.match(arrow.d, /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
  assert.ok(arrow.d.includes(` ${pos.get("a3").y + BOX_H} `));
  const straight = arrowsOf(design, pos).find((a) => a.key === "a0>a1");
  assert.match(straight.d, /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/);
});

test("the number of columns follows the window, at least two", () => {
  assert.equal(maxColsFor({ innerWidth: 300 }), 2);
  assert.ok(maxColsFor({ innerWidth: 1024 }) >= 5);
  assert.equal(maxColsFor({ innerWidth: 5000 }), maxColsFor({ innerWidth: 1100 }));
});
