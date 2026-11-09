import { test } from "node:test";
import assert from "node:assert/strict";
import { createPlayer } from "../public/js/replay/player.js";

function fakeClock() {
  let nextId = 1;
  const pending = new Map();
  const delays = [];
  return {
    delays,
    pendingCount: () => pending.size,
    setTimeout(fn, ms) {
      const id = nextId++;
      pending.set(id, fn);
      delays.push(ms);
      return id;
    },
    clearTimeout(id) {
      pending.delete(id);
    },
    tick() {
      const [id, fn] = pending.entries().next().value;
      pending.delete(id);
      fn();
    },
  };
}

const ev = (...ts) => ts.map((t) => ({ t, type: "round" }));

test("play applies the first event at once and caps long gaps", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 1000, 5000), clock, maxGapMs: 2000 });
  p.play();
  assert.equal(p.cursor, 1);
  assert.deepEqual(clock.delays, [1000]);
  clock.tick();
  assert.equal(p.cursor, 2);
  assert.deepEqual(clock.delays, [1000, 2000]);
  clock.tick();
  assert.equal(p.cursor, 3);
  assert.equal(p.playing, false);
  assert.equal(p.finished, true);
});

test("a slower speed lengthens the delays", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 1000, 5000), clock, maxGapMs: 2000, speed: 0.5 });
  p.play();
  clock.tick();
  assert.deepEqual(clock.delays, [2000, 4000]);
});

test("changing the speed while playing reschedules the pending step", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 1000, 2000), clock });
  p.play();
  assert.deepEqual(clock.delays, [1000]);
  p.setSpeed(2);
  assert.deepEqual(clock.delays, [1000, 500]);
  assert.equal(clock.pendingCount(), 1);
  assert.equal(p.speed, 2);
});

test("setSpeed ignores values that are not positive numbers", () => {
  const p = createPlayer({ events: ev(0, 1), clock: fakeClock() });
  p.setSpeed(0);
  p.setSpeed(-1);
  p.setSpeed(NaN);
  p.setSpeed("fast");
  assert.equal(p.speed, 1);
});

test("next and prev move one event, pause, and stay within bounds", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 10, 20), clock });
  p.play();
  p.next();
  assert.equal(p.playing, false);
  assert.equal(p.cursor, 2);
  assert.equal(clock.pendingCount(), 0);
  p.next();
  p.next();
  assert.equal(p.cursor, 3);
  p.prev();
  assert.equal(p.cursor, 2);
  p.prev();
  p.prev();
  p.prev();
  assert.equal(p.cursor, 0);
});

test("seek clamps to the valid range", () => {
  const p = createPlayer({ events: ev(0, 10, 20), clock: fakeClock() });
  p.seek(999);
  assert.equal(p.cursor, 3);
  p.seek(-5);
  assert.equal(p.cursor, 0);
  p.seek(1.7);
  assert.equal(p.cursor, 1);
  p.seek(NaN);
  assert.equal(p.cursor, 1);
});

test("seeking while playing continues from the new place", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 1000, 2000, 3000), clock });
  p.play();
  p.seek(2);
  assert.equal(p.playing, true);
  assert.equal(clock.pendingCount(), 1);
  clock.tick();
  assert.equal(p.cursor, 3);
});

test("play after finishing starts again from the beginning", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 10), clock });
  p.seek(2);
  assert.equal(p.finished, true);
  p.play();
  assert.equal(p.cursor, 1);
  assert.equal(p.playing, true);
});

test("restart goes back to the start and stays paused", () => {
  const p = createPlayer({ events: ev(0, 10), clock: fakeClock() });
  p.seek(2);
  p.restart();
  assert.equal(p.cursor, 0);
  assert.equal(p.playing, false);
});

test("pause stops the pending timer", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 10, 20), clock });
  p.play();
  p.pause();
  assert.equal(p.playing, false);
  assert.equal(clock.pendingCount(), 0);
});

test("events with no time between them play without a deadlock", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 0, 0, 0), clock });
  p.play();
  while (p.playing) clock.tick();
  assert.equal(p.cursor, 4);
  assert.ok(clock.delays.every((d) => d === 0));
});

test("an empty event list never plays", () => {
  const p = createPlayer({ events: [], clock: fakeClock() });
  p.play();
  assert.equal(p.playing, false);
  assert.equal(p.cursor, 0);
  assert.equal(p.finished, false);
});

test("subscribers hear about changes until they unsubscribe", () => {
  const p = createPlayer({ events: ev(0, 10, 20), clock: fakeClock() });
  let calls = 0;
  const off = p.subscribe(() => calls++);
  p.next();
  p.next();
  assert.equal(calls, 2);
  off();
  p.next();
  assert.equal(calls, 2);
});

test("seeking to the start while playing does not throw and keeps playing", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 1000, 2000), clock });
  p.play();
  p.seek(0);
  assert.equal(p.cursor, 0);
  assert.equal(p.playing, true);
  assert.equal(clock.pendingCount(), 1);
  clock.tick();
  assert.equal(p.cursor, 1);
});

test("timeScale 2 halves the delays while the selected speed stays 1", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 1000, 5000), clock, maxGapMs: 2000, timeScale: 2 });
  p.play();
  assert.deepEqual(clock.delays, [500]);
  clock.tick();
  assert.deepEqual(clock.delays, [500, 1000]);
  assert.equal(p.speed, 1);
});

test("an invalid timeScale falls back to 1", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: ev(0, 1000), clock, timeScale: 0 });
  p.play();
  assert.deepEqual(clock.delays, [1000]);
});

test("a live player follows appended events and notifies", () => {
  const events = [];
  const p = createPlayer({ events, clock: fakeClock(), live: true });
  let notified = 0;
  p.subscribe(() => (notified += 1));
  for (const e of ev(0, 10, 20)) p.append(e);
  assert.equal(p.cursor, 3);
  assert.equal(events.length, 3);
  assert.equal(notified, 3);
  assert.equal(p.live, true);
});

test("a live player is not finished until endLive, then it is an ordinary finished player", () => {
  const p = createPlayer({ events: [], clock: fakeClock(), live: true });
  for (const e of ev(0, 10)) p.append(e);
  assert.equal(p.finished, false);
  p.endLive();
  assert.equal(p.live, false);
  assert.equal(p.finished, true);
});

test("moving back stops following, and seeking to the end follows again", () => {
  const p = createPlayer({ events: [], clock: fakeClock(), live: true });
  for (const e of ev(0, 10, 20)) p.append(e);
  p.prev();
  assert.equal(p.cursor, 2);
  p.append({ t: 30, type: "round" });
  assert.equal(p.cursor, 2);
  p.seek(4);
  p.append({ t: 40, type: "round" });
  assert.equal(p.cursor, 5);
});

test("play does nothing while live: no timer, not playing", () => {
  const clock = fakeClock();
  const p = createPlayer({ events: [], clock, live: true });
  for (const e of ev(0, 10)) p.append(e);
  p.play();
  assert.equal(clock.pendingCount(), 0);
  assert.equal(p.playing, false);
});

test("a player that is not live is unchanged by the live code", () => {
  const p = createPlayer({ events: ev(0, 10), clock: fakeClock() });
  assert.equal(p.live, false);
  assert.equal(p.finished, false);
  p.seek(2);
  assert.equal(p.finished, true);
});
