import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REPEAT_STOP, HANDOFF_CHARS, clampRepeatStop, clampHandoffChars, LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { createPassOn } from "../public/js/engine/handoff.js";
import { limitMessage } from "../public/js/engine/harness.js";
import { createSettingsStore } from "../public/js/storage/settings.js";

const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } });
const call = (worker) => JSON.stringify({ action: "call", worker, instruction: "again" });
const supervisor = () => ({
  pattern: "supervisor",
  nodes: [{ id: "boss", agent: "supervisor", model: "fast", search: false }, { id: "w", agent: "researcher", model: "fast", search: false }],
  edges: [{ from: "boss", to: "w" }],
});
const chain = () => ({
  pattern: "sequential",
  nodes: [{ id: "a", agent: "planner", model: "fast", search: false }, { id: "b", agent: "writer", model: "fast", search: false }],
  edges: [{ from: "a", to: "b" }],
});

test("repeated answers: off below 2, clipped to 4, three by default", () => {
  assert.equal(clampRepeatStop(undefined), REPEAT_STOP.default);
  assert.equal(clampRepeatStop(null), REPEAT_STOP.default);
  assert.equal(clampRepeatStop(0), 0);
  assert.equal(clampRepeatStop(1), 0);
  assert.equal(clampRepeatStop(2), 2);
  assert.equal(clampRepeatStop(9), 4);
  assert.equal(clampRepeatStop("x"), REPEAT_STOP.default);
});

test("handoff size: off by default, otherwise 2,000 to 20,000", () => {
  assert.equal(clampHandoffChars(undefined), 0);
  assert.equal(clampHandoffChars(0), 0);
  assert.equal(clampHandoffChars(-5), 0);
  assert.equal(clampHandoffChars(100), HANDOFF_CHARS.min);
  assert.equal(clampHandoffChars(99999), HANDOFF_CHARS.max);
  assert.equal(clampHandoffChars(8000), 8000);
});

test("a supervisor that gives the same instruction three times in a row is stopped for repeating itself", async () => {
  const events = [];
  const result = await runDesign({
    design: supervisor(),
    task: "t",
    limits: LIMIT_DEFAULTS,
    call: async (body) => (/^Role: supervisor/.test(body.system) ? text(call("w")) : text("a new fact")) ,
    emit: (e) => events.push(e),
  });
  assert.equal(result.outcome, "stopped_limit");
  assert.equal(result.reason, "repeat");
  const warning = events.find((e) => e.type === "warning" && e.limit === "repeat");
  assert.equal(warning.agent, "boss");
  assert.match(warning.message, /3 times in a row from agent/);
});

test("the same answer with other capitals and spacing counts as the same", async () => {
  const replies = [call("w"), call("w").toUpperCase().replace('"ACTION"', '"action"'), `  ${call("w")}\n`];
  let n = 0;
  const result = await runDesign({
    design: supervisor(),
    task: "t",
    limits: LIMIT_DEFAULTS,
    repeatStop: 2,
    call: async (body) => (/^Role: supervisor/.test(body.system) ? text(replies[Math.min(n++, 2)]) : text("fact")),
    emit: () => {},
  });
  assert.equal(result.reason, "repeat");
});

test("with repeated answers off, the same answer goes on until another limit", async () => {
  const result = await runDesign({
    design: supervisor(),
    task: "t",
    limits: { ...LIMIT_DEFAULTS, maxSteps: 6 },
    repeatStop: 0,
    call: async (body) => (/^Role: supervisor/.test(body.system) ? text(call("w")) : text("fact")),
    emit: () => {},
  });
  assert.equal(result.reason, "steps");
});

test("different answers never count as a loop", async () => {
  let n = 0;
  const result = await runDesign({ design: chain(), task: "t", limits: LIMIT_DEFAULTS, call: async () => text(`answer ${n++}`), emit: () => {} });
  assert.equal(result.outcome, "finished");
});

test("limitMessage words the repeated answer", () => {
  assert.match(limitMessage("repeat", LIMIT_DEFAULTS, { label: "Supervisor", value: 3 }), /same answer 3 times in a row from agent Supervisor/);
});

test("passOn cuts a long text once, tells the next agent and warns once", () => {
  const events = [];
  const passOn = createPassOn({ chars: 2000, emit: (e) => events.push(e) });
  const long = "x".repeat(5000);
  const cut = passOn(long, "a");
  assert.ok(cut.startsWith("x".repeat(2000)) && cut.includes("[Cut: the first 2000 of 5000 characters"));
  assert.equal(passOn(long, "a"), cut);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].handoff, { from: "a", chars: 5000, kept: 2000 });
  assert.equal(passOn("short", "a"), "short");
  assert.equal(createPassOn({ chars: 0 })(long, "a"), long);
});

test("a run cuts the handoff to the next agent but the replay keeps the whole answer", async () => {
  const events = [];
  const seen = [];
  const long = "y".repeat(6000);
  await runDesign({
    design: chain(),
    task: "t",
    limits: LIMIT_DEFAULTS,
    handoffChars: 2000,
    call: async (body) => {
      seen.push(body.messages.at(-1).content);
      return text(long);
    },
    emit: (e) => events.push(e),
  });
  assert.ok(!JSON.stringify(seen[1]).includes("y".repeat(2500)));
  assert.ok(JSON.stringify(seen[1]).includes("[Cut:"));
  assert.equal(events.find((e) => e.type === "agent_output" && e.agent === "a").text, long);
  assert.equal(events.filter((e) => e.type === "warning" && e.handoff).length, 1);
});

test("the settings store keeps and clips both settings, with repeated answers on by default", () => {
  const data = {};
  const store = createSettingsStore({ getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } });
  assert.equal(store.get().repeatStop, 3);
  assert.equal(store.get().handoffChars, 0);
  store.setRepeatStop(0);
  store.setHandoffChars(8000);
  assert.deepEqual([store.get().repeatStop, store.get().handoffChars], [0, 8000]);
  store.setRepeatStop(99);
  store.setHandoffChars(1);
  assert.deepEqual([store.get().repeatStop, store.get().handoffChars], [4, 2000]);
});

test("the texts of both settings exist in both languages", () => {
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  for (const k of ["harness.repeatHeading", "harness.repeatIntro", "harness.repeatTimes", "harness.limit.repeat.label", "harness.limit.repeat.hint", "harness.repeatNote", "harness.handoffHeading", "harness.handoffIntro", "harness.limit.handoff.label", "harness.limit.handoff.hint", "harness.handoffNote", "run.outcome.stopped_limit.repeat"]) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
  }
});
