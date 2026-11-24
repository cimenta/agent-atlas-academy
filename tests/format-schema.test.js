import test from "node:test";
import assert from "node:assert/strict";
import { replySchemaFor } from "../public/js/engine/schema.js";
import { callAnthropic } from "../public/js/engine/anthropic.js";
import { toGeminiRequest } from "../public/js/engine/gemini.js";

const node = (agent, extra = {}) => ({ id: agent, agent, model: "fast", search: false, ...extra });
const design = (pattern, nodes = []) => ({ pattern, nodes, edges: [] });
const FMT = { fields: [{ name: "title", type: "text" }, { name: "n", type: "number" }] };

test("each control agent has the schema of its reply", () => {
  assert.deepEqual(replySchemaFor(node("supervisor"), design("supervisor")).required, ["action"]);
  assert.deepEqual(replySchemaFor(node("supervisor"), design("supervisor")).properties.action.enum, ["call", "finish", "create"]);
  assert.deepEqual(replySchemaFor(node("evaluator"), design("evaluator")).properties.verdict.enum, ["accept", "revise"]);
  assert.deepEqual(replySchemaFor(node("router"), design("router")).required, ["route", "reason"]);
  assert.deepEqual(replySchemaFor(node("tally"), design("voting")).required, ["answer", "agree"]);
  assert.deepEqual(replySchemaFor(node("splitter"), design("mapreduce")).required, ["parts"]);
  assert.deepEqual(replySchemaFor(node("planner"), design("planexec")).required, ["steps"]);
  const hand = replySchemaFor(node("writer"), design("handoff"));
  assert.deepEqual(hand.properties.action.enum, ["handoff", "finish"]);
  assert.deepEqual(hand.required, ["action"]);
});

test("every schema is an object schema", () => {
  for (const [n, d] of [[node("supervisor"), design("supervisor")], [node("router"), design("router")], [node("writer"), design("handoff")], [node("writer", { format: FMT }), design("sequential")]]) {
    assert.equal(replySchemaFor(n, d).type, "object");
  }
});

test("an ordinary agent has no schema, a planner that creates agents has none, an agent with a format has its own", () => {
  assert.equal(replySchemaFor(node("writer"), design("sequential")), null);
  assert.equal(replySchemaFor(node("planner", { creates: { max: 1, guidance: "", search: false } }), design("planexec")), null);
  assert.equal(replySchemaFor(node("planner"), design("sequential")), null);
  const s = replySchemaFor(node("writer", { format: FMT }), design("sequential"));
  assert.deepEqual(s.required, ["title", "n"]);
  assert.equal(s.properties.n.type, "number");
});

test("a self-critique judge gets the verdict schema", () => {
  const s = replySchemaFor(node("writer"), design("evaluator"), { judging: true });
  assert.deepEqual(s.properties.verdict.enum, ["accept", "revise"]);
});

test("Anthropic: the schema becomes a forced tool, and the tool input comes back as text", async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "tool_use", id: "t1", name: "reply", input: { verdict: "accept" } }], stop_reason: "tool_use", usage: { input_tokens: 1, output_tokens: 1 } }) };
  };
  const schema = { type: "object", properties: { verdict: { type: "string" } }, required: ["verdict"] };
  const answer = await callAnthropic({ model: "m", messages: [], replySchema: schema }, { apiKey: "sk-ant-api03-XXXXXXXXXXXXXXXX", fetchImpl });
  assert.equal("replySchema" in sent, false);
  assert.deepEqual(sent.tools, [{ name: "reply", description: "Give your reply in this shape.", input_schema: schema }]);
  assert.deepEqual(sent.tool_choice, { type: "tool", name: "reply" });
  assert.deepEqual(answer.content, [{ type: "text", text: '{"verdict":"accept"}' }]);
  assert.equal(answer.stop_reason, "end_turn");
});

test("Anthropic: a request without a schema is sent as it was", async () => {
  let sent;
  const fetchImpl = async (url, init) => {
    sent = JSON.parse(init.body);
    return { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: "hi" }], stop_reason: "end_turn", usage: {} }) };
  };
  await callAnthropic({ model: "m", messages: [] }, { apiKey: "sk-ant-api03-XXXXXXXXXXXXXXXX", fetchImpl });
  assert.equal("tools" in sent || "tool_choice" in sent, false);
});

test("Gemini: JSON mode with the schema, types in capitals, no additionalProperties", () => {
  const request = toGeminiRequest({ model: "m", max_tokens: 50, messages: [{ role: "user", content: "x" }], replySchema: { type: "object", properties: { tags: { type: "array", items: { type: "string" } }, n: { type: "number" }, ok: { type: "boolean" }, a: { type: "string", enum: ["x", "y"] } }, required: ["tags"], additionalProperties: false } });
  assert.equal(request.generationConfig.responseMimeType, "application/json");
  assert.deepEqual(request.generationConfig.responseSchema, { type: "OBJECT", properties: { tags: { type: "ARRAY", items: { type: "STRING" } }, n: { type: "NUMBER" }, ok: { type: "BOOLEAN" }, a: { type: "STRING", enum: ["x", "y"] } }, required: ["tags"] });
  assert.equal(toGeminiRequest({ model: "m", max_tokens: 50, messages: [] }).generationConfig.responseMimeType, undefined);
});

test("Anthropic: a model that refuses a forced tool is asked again once, without the reply tool; any other refusal is not repeated", async () => {
  const sent = [];
  const refuse = { ok: false, status: 400, json: async () => ({ error: { message: 'tool_choice: type "tool" and "any" are not supported for this model.' } }) };
  const answer = { ok: true, status: 200, json: async () => ({ content: [{ type: "text", text: '{"action":"finish"}' }], stop_reason: "end_turn", usage: {} }) };
  const schema = { type: "object", properties: { action: { type: "string" } }, required: ["action"] };
  const fetchImpl = async (url, init) => {
    sent.push(JSON.parse(init.body));
    return sent.length === 1 ? refuse : answer;
  };
  const result = await callAnthropic({ model: "m", messages: [], replySchema: schema }, { apiKey: "sk-ant-api03-XXXXXXXXXXXXXXXX", fetchImpl });
  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0].tool_choice, { type: "tool", name: "reply" });
  assert.equal("tools" in sent[1] || "tool_choice" in sent[1] || "replySchema" in sent[1], false);
  assert.deepEqual(result.content, [{ type: "text", text: '{"action":"finish"}' }]);

  let calls = 0;
  const other = async () => {
    calls += 1;
    return { ok: false, status: 400, json: async () => ({ error: { message: "max_tokens: too large" } }) };
  };
  await assert.rejects(() => callAnthropic({ model: "m", messages: [], replySchema: schema }, { apiKey: "sk-ant-api03-XXXXXXXXXXXXXXXX", fetchImpl: other }), /max_tokens/);
  assert.equal(calls, 1);
});
