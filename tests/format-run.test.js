import test from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { validateRun } from "../public/js/run-schema.js";
import { formatRepairText } from "../public/js/engine/format.js";

const FMT = { fields: [{ name: "title", type: "text" }, { name: "n", type: "number" }] };
const design = (format = FMT) => ({ pattern: "sequential", nodes: [{ id: "writer", agent: "writer", name: "Writer", model: "fast", search: false, ...(format ? { format } : {}) }], edges: [] });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const GOOD = '{"title":"A","n":3}';
function scripted(replies) {
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    const next = replies.shift();
    if (next === undefined) throw new Error("script ran out");
    return text(next);
  };
  return { call, calls };
}
async function run(call, extra = {}) {
  const events = [];
  const result = await runDesign({ design: design(), task: "Task", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e), ...extra });
  return { result, events };
}
const checks = (events) => events.filter((e) => e.type === "format_check");

test("a valid first answer is checked once and passed on as compact JSON", async () => {
  const { call, calls } = scripted([`  ${GOOD.replace(",", ", ")}  `]);
  const { result, events } = await run(call);
  assert.equal(result.outcome, "finished");
  assert.equal(calls.length, 1);
  assert.deepEqual(checks(events).map((e) => [e.ok, e.attempt, e.problems]), [[true, 1, []]]);
  assert.equal(result.finalText, GOOD);
});

test("a broken answer is repaired once", async () => {
  const { call, calls } = scripted(["Sure, here you go.", GOOD]);
  const { result, events } = await run(call);
  assert.equal(result.outcome, "finished");
  const c = checks(events);
  assert.deepEqual(c.map((e) => [e.ok, e.attempt]), [[false, 1], [true, 2]]);
  assert.deepEqual(c[0].problems, ["the reply is not one JSON object"]);
  assert.equal(calls[1].messages.at(-1).content, formatRepairText(c[0].problems));
  assert.equal(result.finalText, GOOD);
});

test("two broken answers fail the agent with format.invalid", async () => {
  const { call } = scripted(["no", '{"title":"A"}']);
  const { result, events } = await run(call);
  assert.equal(result.outcome, "failed");
  const error = events.find((e) => e.type === "error");
  assert.ok(error.message.startsWith("format.invalid:"), error.message);
  assert.ok(error.message.includes("Writer") && error.message.includes("n is missing"), error.message);
  assert.deepEqual(checks(events).map((e) => [e.ok, e.attempt]), [[false, 1], [false, 2]]);
});

test("a fenced valid reply is accepted without the fence", async () => {
  const { call } = scripted(["```json\n" + GOOD + "\n```"]);
  const { result } = await run(call);
  assert.equal(result.finalText, GOOD);
});

test("a carried-on run does not record the same check twice", async () => {
  const first = scripted(["Sure.", GOOD]);
  const a = await run(first.call);
  const resume = a.events.filter((e) => e.type === "agent_output").map((e) => ({ agent: e.agent, text: e.text, tokens: e.tokens }));
  assert.equal(resume.length, 2);
  const { call, calls } = scripted([]);
  const b = await run(call, { resume });
  assert.equal(b.result.outcome, "finished");
  assert.equal(calls.length, 0);
  assert.equal(checks(b.events).length, 0);
  assert.equal(b.result.finalText, GOOD);
});

test("an agent without a format is not checked", async () => {
  const { call } = scripted(["plain words"]);
  const events = [];
  const result = await runDesign({ design: design(null), task: "T", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  assert.equal(result.outcome, "finished");
  assert.equal(checks(events).length, 0);
});

test("the mock provider answers an agent with a format in JSON, and can break once", async () => {
  const f = { fields: [{ name: "title", type: "text" }, { name: "n", type: "number" }, { name: "ok", type: "yesno" }, { name: "tags", type: "list" }] };
  const events = [];
  const result = await runDesign({ design: design(f), task: "T", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  assert.equal(result.outcome, "finished");
  assert.deepEqual(JSON.parse(result.finalText), { title: "Sample text.", n: 42, ok: true, tags: ["one", "two"] });
  assert.deepEqual(checks(events).map((e) => e.ok), [true]);
  const broken = [];
  const again = await runDesign({ design: design(f), task: "T", limits: LIMIT_DEFAULTS, call: createMockCall({ breakFormatOnce: true }), emit: (e) => broken.push(e) });
  assert.equal(again.outcome, "finished");
  assert.deepEqual(checks(broken).map((e) => [e.ok, e.attempt]), [[false, 1], [true, 2]]);
});

test("run-schema knows format_check", async () => {
  const { call } = scripted(["no", GOOD]);
  const { events } = await run(call);
  const record = { id: "r", design: design(), events, task: "Task", recordedWith: { provider: "anthropic" }, schemaVersion: 1 };
  const about = (r) => (validateRun(r).errors ?? []).filter((e) => e.includes("format"));
  assert.deepEqual(about(record), []);
  const bad = structuredClone(record);
  bad.events.find((e) => e.type === "format_check").attempt = 3;
  assert.equal(about(bad).length, 1);
});
