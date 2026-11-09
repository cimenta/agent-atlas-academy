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
  ]);
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
