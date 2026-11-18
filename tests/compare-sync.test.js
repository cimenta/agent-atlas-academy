import { test } from "node:test";
import assert from "node:assert/strict";
import { durationOf, cursorAt, totalsAt, createCompareClock } from "../public/js/compare-sync.js";

const ev = (...ts) => ts.map((t) => ({ t, type: "note" }));
const fakeClock = () => {
  const q = [];
  let id = 0;
  return {
    setTimeout: (fn, ms) => (q.push({ id: ++id, fn, ms }), id),
    clearTimeout: (i) => { const k = q.findIndex((x) => x.id === i); if (k >= 0) q.splice(k, 1); },
    run: () => q.shift()?.fn(),
    pending: () => q.length,
    last: () => q.at(-1),
  };
};
const run = (id, ts) => ({ id, events: ev(...ts), design: { nodes: [] } });

test("cursorAt by time and by step", () => {
  const e = ev(0, 500, 1000);
  assert.equal(durationOf(e), 1000);
  assert.equal(durationOf([]), 0);
  assert.equal(cursorAt(e, "time", 499), 1);
  assert.equal(cursorAt(e, "time", 500), 2);
  assert.equal(cursorAt(e, "step", 2), 2);
  assert.equal(cursorAt(e, "step", 99), 3);
});

test("a short run stays on its last event while a long one plays on", () => {
  const c = createCompareClock({ runs: [run("a", [0, 100]), run("b", [0, 500, 1000])], clock: fakeClock() });
  c.seek(800);
  assert.deepEqual(c.cursors(), [2, 2]);
  c.seek(1000);
  assert.deepEqual(c.cursors(), [2, 3]);
  assert.equal(c.max, 1000);
});

test("play advances by the speed and stops at max", () => {
  const clock = fakeClock();
  const c = createCompareClock({ runs: [run("a", [0, 250])], clock, tickMs: 100 });
  c.setSpeed(2);
  c.play();
  assert.equal(c.playing, true);
  clock.run();
  assert.equal(c.position, 200);
  clock.run();
  assert.equal(c.position, 250);
  assert.equal(c.playing, false);
  assert.equal(clock.pending(), 0);
});

test("next and prev move one step in step mode and to the next event time in time mode", () => {
  const c = createCompareClock({ runs: [run("a", [0, 300, 900]), run("b", [0, 400])], clock: fakeClock() });
  c.next();
  assert.equal(c.position, 300);
  c.next();
  assert.equal(c.position, 400);
  c.prev();
  assert.equal(c.position, 300);
  c.setMode("step");
  c.seek(1);
  c.next();
  assert.equal(c.position, 2);
  c.prev();
  assert.equal(c.position, 1);
});

test("setMode converts the position", () => {
  const c = createCompareClock({ runs: [run("a", [0, 100, 200, 300])], clock: fakeClock() });
  c.seek(200);
  c.setMode("step");
  assert.equal(c.position, 3);
  assert.equal(c.max, 4);
  c.seek(2);
  c.setMode("time");
  assert.equal(c.position, 100);
});

test("seek is clamped, and restart goes to the start", () => {
  const c = createCompareClock({ runs: [run("a", [0, 100])], clock: fakeClock() });
  c.seek(-5);
  assert.equal(c.position, 0);
  c.seek(9999);
  assert.equal(c.position, 100);
  c.restart();
  assert.equal(c.position, 0);
});

test("subscribe is notified and can unsubscribe", () => {
  const c = createCompareClock({ runs: [run("a", [0, 100])], clock: fakeClock() });
  let n = 0;
  const off = c.subscribe(() => n++);
  c.seek(50);
  off();
  c.seek(100);
  assert.equal(n, 1);
});

test("totalsAt grows with the cursor and has no NaN for an old recording", () => {
  const r = {
    id: "a",
    design: { pattern: "sequential", nodes: [{ id: "w", agent: "writer", model: "balanced" }] },
    recordedWith: { provider: "anthropic" },
    events: [
      { t: 0, type: "run_start" },
      { t: 400, type: "round", agent: "w", usage: { input: 100, output: 20 } },
      { t: 500, type: "agent_output", agent: "w", text: "x", tokens: { input: 100, output: 20 } },
    ],
  };
  assert.deepEqual(totalsAt(r, 0), { ms: 0, tokens: 0, cost: totalsAt(r, 0).cost });
  assert.equal(totalsAt(r, 2).tokens, 120);
  assert.equal(totalsAt(r, 2).ms, 400);
  assert.ok(totalsAt(r, 3).cost > 0);
  const old = totalsAt({ id: "o", events: [{ t: 5, type: "note" }] }, 1);
  assert.doesNotMatch(JSON.stringify(old), /NaN/);
});

test("cost grows with the tokens while an agent is still working", () => {
  const r = {
    id: "a",
    design: { pattern: "sequential", nodes: [{ id: "w", agent: "writer", model: "balanced" }] },
    recordedWith: { provider: "anthropic" },
    events: [
      { t: 0, type: "run_start" },
      { t: 400, type: "round", agent: "w", usage: { input: 1000, output: 200 } },
      { t: 900, type: "round", agent: "w", usage: { input: 3000, output: 400 } },
      { t: 1000, type: "agent_output", agent: "w", text: "x", tokens: { input: 4000, output: 600 } },
    ],
  };
  const one = totalsAt(r, 2);
  const two = totalsAt(r, 3);
  assert.ok(one.cost > 0 && two.cost > one.cost);
  assert.equal(two.tokens, 4600);
  assert.ok(Math.abs(totalsAt(r, 4).cost - two.cost) < 1e-9);
});
