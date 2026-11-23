import test from "node:test";
import assert from "node:assert/strict";
import { BOX_H, BOX_W, PORT_R, linkPath, roundedPath, portPointAt, portSideOf } from "../public/js/create/diagram-geometry.js";

const pos = new Map([
  ["a", { x: 20, y: 20 }],
  ["b", { x: 200, y: 20 }],
  ["c", { x: 380, y: 20 }],
  ["d", { x: 380, y: 140 }],
  ["e", { x: 200, y: 140 }],
]);
const design = (...pairs) => ({ edges: pairs.map(([from, to]) => ({ from, to })) });

test("a dot goes to the bottom when its line goes to a row below, to the top for a row above, otherwise it keeps its side", () => {
  const d = design(["c", "d"], ["e", "a"], ["a", "b"]);
  assert.equal(portSideOf(d, pos, "c", "out", "right"), "bottom");
  assert.equal(portSideOf(d, pos, "d", "in", "left"), "top");
  assert.equal(portSideOf(d, pos, "e", "out", "left"), "top");
  assert.equal(portSideOf(d, pos, "a", "in", "left"), "bottom");
  assert.equal(portSideOf(d, pos, "b", "in", "left"), "left");
});

test("agents next to each other in a row are joined by a straight line from dot to dot", () => {
  const link = linkPath(pos, "a", "b", portPointAt(pos, "a", "right"), portPointAt(pos, "b", "left"));
  assert.match(link.d, /^M[\d.]+,[\d.]+ L[\d.]+,[\d.]+$/);
});

test("between two rows the line starts at the bottom dot, runs along the gap and ends at the top dot", () => {
  const out = portPointAt(pos, "b", "bottom");
  const inn = portPointAt(pos, "d", "top");
  const link = linkPath(pos, "b", "d", out, inn);
  assert.ok(link.d.startsWith(`M${out.x},${out.y + PORT_R}`), link.d);
  assert.ok(link.d.endsWith(`${inn.x},${inn.y - PORT_R - 1}`), link.d);
  assert.ok(!link.d.includes("NaN"));
  assert.equal(link.mid.y, (out.y + PORT_R + inn.y - PORT_R - 1) / 2);
});

test("dots right above each other give a straight vertical line", () => {
  const link = linkPath(pos, "c", "d", portPointAt(pos, "c", "bottom"), portPointAt(pos, "d", "top"));
  assert.ok(!link.d.includes("NaN"));
  assert.ok(link.d.startsWith(`M${380 + BOX_W / 2},${20 + BOX_H + PORT_R}`), link.d);
});

test("going up works like going down", () => {
  const out = portPointAt(pos, "e", "top");
  const link = linkPath(pos, "e", "a", out, portPointAt(pos, "a", "bottom"));
  assert.ok(link.d.startsWith(`M${out.x},${out.y - PORT_R}`), link.d);
  assert.ok(!link.d.includes("NaN"));
});

test("an agent standing between two in a row sends the line over the top", () => {
  const link = linkPath(pos, "a", "c", portPointAt(pos, "a", "right"), portPointAt(pos, "c", "left"));
  assert.ok(link.mid.y < 20, "the line runs above the row");
  assert.ok(!link.d.includes("NaN"));
});

test("repeated points are dropped from a rounded path", () => {
  assert.ok(!roundedPath([[0, 0], [10, 0], [10, 0], [10, 20]]).includes("NaN"));
});
