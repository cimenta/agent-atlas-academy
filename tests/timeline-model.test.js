import { test } from "node:test";
import assert from "node:assert/strict";
import { timelineOf, timeAtCursor, cursorAtTime, runTotal } from "../public/js/replay/timeline-model.js";

const events = [
  { t: 0, type: "run_start", task: "x" },
  { t: 1, type: "agent_start", agent: "a", role: "A", model: "m", tools: [], system: "s" },
  { t: 4000, type: "round", agent: "a", round: 1, ms: 3999, stop: "end_turn", usage: { input: 5, output: 5 }, newMessages: [{ role: "user", content: "Task: x" }], content: [{ type: "text", text: "A" }] },
  { t: 4000, type: "agent_output", agent: "a", text: "A", tokens: { input: 5, output: 5 } },
  { t: 4000, type: "handoff", from: "a", to: "b", note: "A" },
  { t: 4001, type: "agent_start", agent: "b", role: "B", model: "m", tools: [], system: "s" },
  { t: 9000, type: "round", agent: "b", round: 1, ms: 5000, stop: "end_turn", usage: { input: 8, output: 5 }, newMessages: [{ role: "user", content: "Task: x\n\nA" }], content: [{ type: "text", text: "B" }] },
  { t: 9000, type: "agent_output", agent: "b", text: "B", tokens: { input: 8, output: 5 } },
  { t: 9001, type: "done", outcome: "finished" },
];

test("a model call is a bar that ends where the round was recorded and lasts as long as the call", () => {
  const { bars } = timelineOf(events, "sequential");
  assert.deepEqual(bars.map((b) => [b.agent, b.start, b.end]), [["a", 1, 4000], ["b", 4000, 9000]]);
});

test("a handoff is an arrow from the end of the sender to the start of the receiver, not a bar", () => {
  const { arrows, bars } = timelineOf(events, "sequential");
  assert.equal(arrows.length, 1);
  assert.deepEqual([arrows[0].from, arrows[0].to, arrows[0].fromT, arrows[0].toT], ["a", "b", 4000, 4001]);
  assert.ok(!bars.some((b) => b.kind === "handoff"));
});

test("an agent that starts late waits first, and every agent that finished has a done mark", () => {
  const { waits, done } = timelineOf(events, "sequential");
  assert.deepEqual(waits.map((w) => [w.agent, w.start, w.end]), [["b", 0, 4000]]);
  assert.deepEqual(done.map((d) => [d.agent, d.t]), [["a", 4000], ["b", 9000]]);
  const late = events.map((e) => (e.agent === "b" && e.type === "round" ? { ...e, ms: 1000 } : e));
  assert.deepEqual(timelineOf(late, "sequential").waits.map((w) => [w.agent, w.start, w.end]), [["b", 0, 8000]]);
});

test("time and cursor convert both ways", () => {
  assert.equal(runTotal(events), 9001);
  assert.equal(timeAtCursor(events, 0), 0);
  assert.equal(timeAtCursor(events, 3), 4000);
  assert.equal(timeAtCursor(events, events.length), 9001);
  assert.equal(cursorAtTime(events, 4000), 5);
  assert.equal(cursorAtTime(events, 0), 1);
});

test("an agent that was working when the run failed gets a bar up to the error and a failed mark, not an empty lane", () => {
  const failedRun = [
    ...events.slice(0, 8),
    { t: 9001, type: "handoff", from: "b", to: "c", note: "B" },
    { t: 9001, type: "agent_start", agent: "c", role: "C", model: "m", tools: [], system: "s" },
    { t: 129001, type: "error", message: "Timeout" },
    { t: 129001, type: "done", outcome: "failed" },
  ];
  const { bars, failed, waits } = timelineOf(failedRun, "sequential");
  const bar = bars.find((b) => b.agent === "c");
  assert.deepEqual([bar.start, bar.end, bar.failed], [9001, 129001, true]);
  assert.deepEqual(failed, [{ agent: "c", t: 129001, stopped: false }]);
  assert.ok(waits.some((w) => w.agent === "c" && w.end === 9001));
});

test("an agent that was stopped by a limit before its call has no point at 0: it waits, then gets a stopped mark", () => {
  const stopped = [
    ...events.slice(0, 8),
    { t: 9001, type: "handoff", from: "b", to: "c", note: "B" },
    { t: 9001, type: "agent_start", agent: "c", role: "C", model: "m", tools: [], system: "s" },
    { t: 9001, type: "done", outcome: "stopped_limit", reason: "steps" },
  ];
  const { bars, failed, waits } = timelineOf(stopped, "sequential");
  assert.ok(!bars.some((b) => b.agent === "c"));
  assert.deepEqual(failed, [{ agent: "c", t: 9001, stopped: true }]);
  assert.ok(waits.some((w) => w.agent === "c" && w.start === 0 && w.end === 9001));
});
