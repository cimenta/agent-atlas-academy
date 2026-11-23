import test from "node:test";
import assert from "node:assert/strict";
import { BOX_H, BOX_W, linkPath, roundedPath, portPoint } from "../public/js/create/diagram-geometry.js";

const pos = new Map([
  ["a", { x: 20, y: 20 }],
  ["b", { x: 200, y: 20 }],
  ["c", { x: 380, y: 20 }],
  ["d", { x: 380, y: 140 }],
  ["e", { x: 200, y: 140 }],
]);
const out = (id) => portPoint(pos, id, "out");
const inn = (id) => portPoint(pos, id, "in");

test("agents next to each other in a row are joined by a straight line", () => {
  const link = linkPath(pos, "a", "b", out("a"), inn("b"));
  assert.match(link.d, /^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
});

test("a line between two rows goes down from the middle of the box and into the middle of the other", () => {
  const link = linkPath(pos, "c", "d", out("c"), inn("d"));
  assert.ok(link.d.startsWith(`M${380 + BOX_W / 2},${20 + BOX_H}`), link.d);
  assert.ok(link.d.endsWith(`${380 + BOX_W / 2},${139}`), link.d);
  assert.ok(!link.d.includes("NaN"));
});

test("a line between two rows with a bend runs along the gap and has its remove point there", () => {
  const link = linkPath(pos, "b", "d", out("b"), inn("d"));
  assert.ok(!link.d.includes("NaN"));
  assert.equal(link.mid.y, (20 + BOX_H + 139) / 2);
});

test("going up works like going down", () => {
  const link = linkPath(pos, "e", "a", out("e"), inn("a"));
  assert.ok(link.d.startsWith(`M${200 + BOX_W / 2},140`), link.d);
  assert.ok(!link.d.includes("NaN"));
});

test("an agent standing between two in a row sends the line over the top", () => {
  const link = linkPath(pos, "a", "c", out("a"), inn("c"));
  assert.ok(link.mid.y < 20, "the line runs above the row");
  assert.ok(!link.d.includes("NaN"));
});

test("rows that overlap fall back to a straight line", () => {
  const near = new Map([["a", { x: 20, y: 20 }], ["b", { x: 200, y: 20 + BOX_H / 2 + 4 }]]);
  const link = linkPath(near, "a", "b", portPoint(near, "a", "out"), portPoint(near, "b", "in"));
  assert.match(link.d, /^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
});

test("repeated points are dropped from a rounded path", () => {
  assert.ok(!roundedPath([[0, 0], [10, 0], [10, 0], [10, 20]]).includes("NaN"));
});
