import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { RUN_SCHEMA_VERSION, EVENT_TYPES, validateRun } from "../public/js/run-schema.js";

const sample = () =>
  JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample-run.json"), "utf8"));

test("the schema version is 1 and the event types are the agreed list", () => {
  assert.equal(RUN_SCHEMA_VERSION, 1);
  assert.deepEqual(EVENT_TYPES, [
    "run_start",
    "agent_start",
    "round",
    "tool_call",
    "tool_result",
    "handoff",
    "warning",
    "title",
    "agent_output",
    "done",
    "error",
    "approval",
    "approved",
    "loop_end",
    "note",
    "condense",
    "agent_created",
    "agent_refused",
    "handoff_refused",
    "format_check",
    "guardrail_check",
  ]);
});

const guardrailEvent = (extra = {}) => ({ type: "guardrail_check", t: 1000, agent: "writer", guardrail: 1, where: "output", kind: "secret", ok: true, attempt: 1, action: "passed", reason: "", ...extra });

test("a guardrail check event is checked for its shape", () => {
  const withEvent = (event) => {
    const run = sample();
    const at = run.events.length - 1;
    run.events.splice(at, 0, { ...event, t: run.events[at - 1].t });
    return validateRun(run);
  };
  assert.equal(withEvent(guardrailEvent()).ok, true);
  for (const bad of [{ attempt: 3 }, { action: "x" }, { agent: "" }, { guardrail: 0 }, { guardrail: 4 }, { where: "middle" }, { ok: "yes" }, { reason: 5 }, { kind: "nope" }]) {
    const result = withEvent(guardrailEvent(bad));
    assert.equal(result.ok, false, JSON.stringify(bad));
    assert.ok(result.errors.some((e) => /guardrail check/.test(e)), JSON.stringify(result.errors));
  }
});

test("the sample run is valid", () => {
  const result = validateRun(sample());
  assert.deepEqual(result, { ok: true, errors: [] });
});

function mutated(change) {
  const run = sample();
  change(run);
  return validateRun(run);
}

const bad = [
  ["missing events", (r) => delete r.events, /events/],
  ["empty events", (r) => (r.events = []), /events/],
  ["event without type", (r) => delete r.events[1].type, /type/],
  ["unknown event type", (r) => (r.events[1].type = "x"), /type/],
  ["t as a string", (r) => (r.events[2].t = "5"), /\bt\b/],
  ["decreasing t", (r) => (r.events[3].t = 1), /\bt\b/],
  ["agent_start without agent", (r) => delete r.events[1].agent, /agent/],
  ["handoff without to", (r) => delete r.events[3].to, /to/],
  ["agent_output without text", (r) => delete r.events[2].text, /text/],
  ["schemaVersion 2", (r) => (r.schemaVersion = 2), /schemaVersion/],
  ["missing id", (r) => delete r.id, /id/],
  ["missing recordedWith", (r) => delete r.recordedWith, /recordedWith/],
];

for (const [name, change, pattern] of bad) {
  test(`rejects: ${name}`, () => {
    const result = mutated(change);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((e) => pattern.test(e)), `errors were ${JSON.stringify(result.errors)}`);
  });
}

test("rejects values that are not runs at all", () => {
  for (const value of [null, undefined, "text", 5, [], true]) {
    const result = validateRun(value);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  }
});

test("rejects events that are not objects", () => {
  const result = mutated((r) => (r.events[1] = "oops"));
  assert.equal(result.ok, false);
});

test("rejects events that mention an agent that never starts", () => {
  const run = sample();
  run.events.push({ t: run.events[run.events.length - 1].t, type: "agent_output", agent: "ghost", text: "boo" });
  run.events.push({ t: run.events[run.events.length - 1].t, type: "handoff", from: "ghost", to: "nobody" });
  const result = validateRun(run);
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes("ghost")));
  assert.ok(result.errors.some((e) => e.includes("nobody")));
});

test("a handoff to an agent of the design that never started is valid (a debate cut off before its judge)", () => {
  const run = sample();
  const last = run.events[run.events.length - 1].t;
  run.design = { pattern: "debate", nodes: [{ id: "late-judge", agent: "judge", model: "fast", search: false }], edges: [] };
  const from = run.events.find((e) => e.type === "agent_start").agent;
  run.events.push({ t: last, type: "handoff", from, to: "late-judge" });
  assert.deepEqual(validateRun(run).errors, []);
});

test("rejects negative or non-finite token counts", () => {
  const run = sample();
  const event = run.events.find((e) => e.tokens);
  if (!event) return;
  event.tokens = { input: -5, output: 1 };
  assert.equal(validateRun(run).ok, false);
});

test("a run with a loop_end event is valid, and so is one without it", () => {
  const run = sample();
  assert.equal(validateRun(run).ok, true);
  const last = run.events.at(-1);
  run.events.splice(-1, 0, { type: "loop_end", result: "accepted", round: 1, judged: true, t: last.t });
  assert.deepEqual(validateRun(run), { ok: true, errors: [] });
});
