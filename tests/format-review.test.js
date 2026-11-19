import test from "node:test";
import assert from "node:assert/strict";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { deriveInspector } from "../public/js/replay/inspect-model.js";
import { withoutFailedFormat } from "../public/js/create/create-model.js";
import { replySchemaFor } from "../public/js/engine/schema.js";
import { toGeminiRequest } from "../public/js/engine/gemini.js";
import { formatSchema } from "../public/js/engine/format.js";

const FMT = { fields: [{ name: "title", type: "text" }, { name: "n", type: "number" }] };
const GOOD = '{"title":"A","n":3}';
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const design = (extra = {}, top = {}) => ({ pattern: "sequential", ...top, nodes: [{ id: "writer", agent: "writer", name: "Writer", model: "fast", search: false, format: FMT, ...extra }], edges: [] });
function scripted(replies) {
  const calls = [];
  return { calls, call: async (body) => (calls.push(structuredClone(body)), text(replies.shift())) };
}
async function run(d, replies, extra = {}) {
  const events = [];
  const s = scripted(replies);
  const result = await runDesign({ design: d, task: "T", limits: LIMIT_DEFAULTS, call: s.call, emit: (e) => events.push(e), ...extra });
  return { result, events, calls: s.calls };
}
const answersOf = (events) => events.filter((e) => e.type === "agent_output").map((e) => ({ agent: e.agent, text: e.text, tokens: e.tokens }));

test("an agent that failed its format shows as failed, so it gets a Retry", async () => {
  const { events } = await run(design(), ["no", '{"title":"A"}']);
  assert.equal(deriveInspector(events).agents.writer.status, "error");
});

test("a Retry after format.invalid asks the model again instead of replaying the bad answers", async () => {
  const first = await run(design(), ["no", '{"title":"A"}']);
  const resume = withoutFailedFormat(answersOf(first.events), first.events);
  assert.deepEqual(resume, []);
  const again = await run(design(), [GOOD], { resume });
  assert.equal(again.result.outcome, "finished");
  assert.equal(again.calls.length, 1);
  assert.equal(again.result.finalText, GOOD);
});

test("withoutFailedFormat keeps the answers of agents whose format was fine", () => {
  const events = [
    { type: "agent_output", agent: "a", text: "ok" },
    { type: "format_check", agent: "a", ok: true, attempt: 1, problems: [] },
    { type: "agent_output", agent: "b", text: "bad1" },
    { type: "format_check", agent: "b", ok: false, attempt: 1, problems: ["x"] },
    { type: "agent_output", agent: "b", text: "bad2" },
    { type: "format_check", agent: "b", ok: false, attempt: 2, problems: ["x"] },
  ];
  assert.deepEqual(withoutFailedFormat(events.filter((e) => e.type === "agent_output"), events).map((a) => a.text), ["ok"]);
});

test("a forced reply cannot carry notes, so an agent that writes notes is not forced and a format agent does not write them", async () => {
  const d = { pattern: "mapreduce", memory: { notebook: true }, nodes: [{ id: "splitter", agent: "splitter", model: "fast", search: false }, { id: "worker", agent: "worker", model: "fast", search: false }, { id: "reducer", agent: "reducer", model: "fast", search: false }], edges: [{ from: "splitter", to: "worker" }, { from: "worker", to: "reducer" }] };
  const a = await run(d, ['{"parts":["p1","p2"]}', "r1", "r2", "final"]);
  assert.equal("replySchema" in a.calls[0], false);
  const f = await run(design({}, { memory: { notebook: true } }), [GOOD]);
  assert.ok(!f.calls[0].system.includes("<note>"));
  assert.ok(f.calls[0].replySchema);
});

test("the router schema requires the reason the reader needs", () => {
  assert.deepEqual(replySchemaFor({ agent: "router" }, { pattern: "router" }).required, ["route", "reason"]);
});

test("Gemini keeps field names that look like schema words", () => {
  const f = { fields: [{ name: "required", type: "text" }, { name: "enum", type: "list" }, { name: "additionalProperties", type: "number" }] };
  const g = toGeminiRequest({ model: "m", max_tokens: 5, messages: [], replySchema: formatSchema(f) }).generationConfig.responseSchema;
  assert.deepEqual(Object.keys(g.properties), ["required", "enum", "additionalProperties"]);
  assert.equal(g.properties.required.type, "STRING");
  assert.equal(g.properties.enum.type, "ARRAY");
  assert.equal(g.properties.additionalProperties.type, "NUMBER");
  assert.deepEqual(g.required, ["required", "enum", "additionalProperties"]);
});

test("the replay check steps tell how many fields fit, what was asked and what the answer was", async () => {
  const { events } = await run(design(), ["no", GOOD]);
  const steps = deriveInspector(events).agents.writer.steps.filter((s) => s.kind === "check");
  assert.deepEqual(steps.map((s) => s.title.key), ["insp.formatFailed", "insp.formatRepairAsked", "insp.formatOkRepaired"]);
  assert.equal(steps[0].title.params.problems, "the reply is not one JSON object");
  assert.equal(steps[0].output, "no");
  assert.deepEqual(steps[2].title.params, { n: 2 });
  const clean = await run(design(), [GOOD]);
  assert.equal(deriveInspector(clean.events).agents.writer.steps.find((s) => s.kind === "check").title.key, "insp.formatOk");
});
