import { test } from "node:test";
import assert from "node:assert/strict";
import { toGeminiRequest, fromGeminiResponse } from "../public/js/engine/gemini.js";
import { toolDefinition } from "../public/js/engine/tools.js";

test("the tools of our own go to Gemini as function declarations, with the types in capitals", () => {
  const request = toGeminiRequest({ model: "m", max_tokens: 100, messages: [{ role: "user", content: "hi" }], tools: [toolDefinition("calculator"), toolDefinition("datetime")] });
  assert.equal(request.tools.length, 1);
  const [calculator, datetime] = request.tools[0].functionDeclarations;
  assert.equal(calculator.name, "calculator");
  assert.equal(calculator.parameters.type, "OBJECT");
  assert.equal(calculator.parameters.properties.expression.type, "STRING");
  assert.deepEqual(calculator.parameters.required, ["expression"]);
  assert.equal(datetime.name, "datetime");
});

test("the search of the provider alone stays google_search, and with functions the functions are sent", () => {
  const search = { type: "web_search_20250305", name: "web_search", max_uses: 3 };
  assert.deepEqual(toGeminiRequest({ model: "m", max_tokens: 1, messages: [], tools: [search] }).tools, [{ google_search: {} }]);
  const both = toGeminiRequest({ model: "m", max_tokens: 1, messages: [], tools: [search, toolDefinition("calculator")] });
  assert.equal(both.tools.length, 1);
  assert.ok(both.tools[0].functionDeclarations);
});

test("a call for a tool and its result go back to Gemini as a functionCall and a functionResponse, with the signature kept", () => {
  const request = toGeminiRequest({
    model: "m",
    max_tokens: 100,
    messages: [
      { role: "user", content: "what is 2 + 2?" },
      { role: "assistant", content: [{ type: "text", text: "Let me check." }, { type: "tool_use", id: "call_1", name: "calculator", input: { expression: "2 + 2" }, thoughtSignature: "sig" }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "4" }] },
    ],
    tools: [toolDefinition("calculator")],
  });
  assert.equal(request.contents.length, 3);
  assert.deepEqual(request.contents[1], { role: "model", parts: [{ text: "Let me check." }, { functionCall: { name: "calculator", args: { expression: "2 + 2" } }, thoughtSignature: "sig" }] });
  assert.deepEqual(request.contents[2], { role: "user", parts: [{ functionResponse: { name: "calculator", response: { result: "4" } } }] });
});

test("a failed tool result is sent to Gemini as an error", () => {
  const request = toGeminiRequest({
    model: "m",
    max_tokens: 100,
    messages: [
      { role: "assistant", content: [{ type: "tool_use", id: "call_1", name: "calculator", input: {} }] },
      { role: "user", content: [{ type: "tool_result", tool_use_id: "call_1", content: "Division by zero.", is_error: true }] },
    ],
  });
  assert.deepEqual(request.contents[1].parts[0].functionResponse.response, { error: "Division by zero." });
});

test("a functionCall in the answer of Gemini becomes a tool_use block, and the answer asks for the tool", () => {
  const answer = fromGeminiResponse({
    candidates: [{ finishReason: "STOP", content: { parts: [{ text: "Checking." }, { functionCall: { name: "calculator", args: { expression: "2 + 2" } }, thoughtSignature: "sig" }, { functionCall: { name: "datetime", args: {} } }] } }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
  });
  assert.equal(answer.stop_reason, "tool_use");
  const uses = answer.content.filter((b) => b.type === "tool_use");
  assert.equal(uses.length, 2);
  assert.deepEqual(uses[0], { type: "tool_use", id: "call_1", name: "calculator", input: { expression: "2 + 2" }, thoughtSignature: "sig" });
  assert.equal(uses[1].id, "call_2");
  assert.deepEqual(answer.content.find((b) => b.type === "text"), { type: "text", text: "Checking." });
});

test("an answer without a call stays an ordinary end of turn", () => {
  const answer = fromGeminiResponse({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: "hello" }] } }] });
  assert.equal(answer.stop_reason, "end_turn");
  assert.equal(answer.content.some((b) => b.type === "tool_use"), false);
});
