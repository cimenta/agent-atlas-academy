import { test } from "node:test";
import assert from "node:assert/strict";
import { autoPositions, arrowsOf, extentOf, maxColsFor, flippedOf, portPoint, linkBetween, PORT_R, CELL_W, BOX_W, BOX_H } from "../public/js/create/diagram-geometry.js";

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
});

test("the second row reads right to left, so the next agent is under the last one of the row above", () => {
  const pos = autoPositions(chain(8), { wide: true, maxCols: 6 });
  assert.equal(pos.get("a4").x, pos.get("a3").x);
  assert.ok(pos.get("a5").x < pos.get("a4").x);
  assert.equal(pos.get("a7").x, pos.get("a0").x);
  assert.deepEqual([...flippedOf(chain(8), { wide: true, maxCols: 6 })].sort(), ["a4", "a5", "a6", "a7"]);
  assert.equal(flippedOf(chain(5), { wide: true, maxCols: 6 }).size, 0);
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

test("the arrow to the next row is a short one straight down, and the arrows of the second row point left", () => {
  const design = chain(8);
  const pos = autoPositions(design, { wide: true, maxCols: 6 });
  const down = arrowsOf(design, pos).find((a) => a.key === "a3>a4");
  const [dx1, , dx2] = down.d.match(/[\d.]+/g).map(Number);
  assert.equal(dx1, dx2);
  const back = arrowsOf(design, pos).find((a) => a.key === "a4>a5");
  const [x1, , x2] = back.d.match(/[\d.]+/g).map(Number);
  assert.ok(x2 < x1);
});

test("the dots: the sending one on the right and the receiving one on the left, swapped in a row that reads right to left", () => {
  const pos = autoPositions(chain(3), { wide: true });
  const out = portPoint(pos, "a0", "out");
  const inn = portPoint(pos, "a0", "in");
  assert.equal(out.x - inn.x, BOX_W);
  assert.equal(out.y, inn.y);
  assert.equal(portPoint(pos, "a0", "out", { flipped: true }).x, inn.x);
  const up = portPoint(pos, "a0", "out", { vertical: true });
  assert.equal(up.y - portPoint(pos, "a0", "in", { vertical: true }).y, BOX_H);
});

test("a link touches the circles: it starts and stops at the edge of the dots", () => {
  const link = linkBetween({ x: 0, y: 0 }, { x: 100, y: 0 });
  assert.equal(link.x1, PORT_R);
  assert.ok(link.x2 < 100 && link.x2 >= 100 - PORT_R - 1);
});

test("the number of columns follows the window, at least two", () => {
  assert.equal(maxColsFor({ innerWidth: 300 }), 2);
  assert.ok(maxColsFor({ innerWidth: 1024 }) >= 5);
  assert.equal(maxColsFor({ innerWidth: 5000 }), maxColsFor({ innerWidth: 1100 }));
});
