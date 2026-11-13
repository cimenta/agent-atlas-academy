import { test } from "node:test";
import assert from "node:assert/strict";
import { callGemini, toGeminiRequest, fromGeminiResponse } from "../public/js/engine/gemini.js";
import { AnthropicError, redact } from "../public/js/engine/anthropic.js";

const KEY = "AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
const okResponse = (data) => ({ ok: true, status: 200, json: async () => data });
const errResponse = (status, message) => ({ ok: false, status, json: async () => ({ error: { message } }) });

test("the request goes to the model URL with the key only in a header", async () => {
  let seen;
  const fetchImpl = async (url, init) => {
    seen = { url, init };
    return okResponse({ candidates: [{ content: { parts: [{ text: "hi" }] }, finishReason: "STOP" }], usageMetadata: {} });
  };
  await callGemini({ model: "gemini-3.5-flash-lite", max_tokens: 100, system: "Be brief.", messages: [{ role: "user", content: "Hello" }] }, { apiKey: KEY, fetchImpl });
  assert.equal(seen.url, "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
  assert.equal(seen.init.headers["x-goog-api-key"], KEY);
  assert.ok(!seen.url.includes(KEY));
  assert.ok(!seen.init.body.includes(KEY));
});

test("system, messages, token limit and search tool are mapped to the Gemini shape", () => {
  const request = toGeminiRequest({
    model: "m",
    max_tokens: 321,
    system: "Be brief.",
    messages: [
      { role: "user", content: "Question" },
      { role: "assistant", content: [{ type: "server_tool_use", name: "web_search", input: { query: "q" } }, { type: "text", text: "Answer" }] },
      { role: "user", content: "More" },
    ],
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 2 }],
  });
  assert.deepEqual(request.systemInstruction, { parts: [{ text: "Be brief." }] });
  assert.deepEqual(request.contents, [
    { role: "user", parts: [{ text: "Question" }] },
    { role: "model", parts: [{ text: "Answer" }] },
    { role: "user", parts: [{ text: "More" }] },
  ]);
  assert.equal(request.generationConfig.maxOutputTokens, 321);
  assert.deepEqual(request.tools, [{ google_search: {} }]);
});

test("a request without tools has no tools field", () => {
  const request = toGeminiRequest({ model: "m", max_tokens: 10, system: "s", messages: [{ role: "user", content: "x" }] });
  assert.equal("tools" in request, false);
});

test("the answer is turned into Anthropic-shaped content, stop reason and usage", () => {
  const out = fromGeminiResponse({
    candidates: [{ content: { parts: [{ text: "One " }, { text: "two" }] }, finishReason: "STOP" }],
    usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 5, thoughtsTokenCount: 3 },
  });
  assert.deepEqual(out.content, [{ type: "text", text: "One two" }]);
  assert.equal(out.stop_reason, "end_turn");
  assert.deepEqual(out.usage, { input_tokens: 12, output_tokens: 8 });
});

test("MAX_TOKENS becomes max_tokens", () => {
  const out = fromGeminiResponse({ candidates: [{ content: { parts: [{ text: "cut" }] }, finishReason: "MAX_TOKENS" }], usageMetadata: {} });
  assert.equal(out.stop_reason, "max_tokens");
});

test("web grounding becomes a search call, a search result and a search count", () => {
  const out = fromGeminiResponse({
    candidates: [
      {
        content: { parts: [{ text: "Found it" }] },
        finishReason: "STOP",
        groundingMetadata: {
          webSearchQueries: ["alpha", "beta"],
          groundingChunks: [{ web: { uri: "https://a.example", title: "A" } }, { web: { uri: "https://b.example", title: "B" } }],
        },
      },
    ],
    usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
  });
  const types = out.content.map((b) => b.type);
  assert.deepEqual(types, ["server_tool_use", "server_tool_use", "web_search_tool_result", "text"]);
  assert.equal(out.content[0].input.query, "alpha");
  assert.deepEqual(out.content[2].content, [
    { title: "A", url: "https://a.example" },
    { title: "B", url: "https://b.example" },
  ]);
  assert.equal(out.usage.server_tool_use.web_search_requests, 2);
});

test("a blocked prompt throws a clear error", () => {
  assert.throws(() => fromGeminiResponse({ promptFeedback: { blockReason: "SAFETY" } }), (e) => e instanceof AnthropicError && /SAFETY/.test(e.message));
});

test("errors are retryable for 429 and 5xx, never repeat the key and use AnthropicError", async () => {
  await assert.rejects(
    callGemini({ model: "m", messages: [] }, { apiKey: KEY, fetchImpl: async () => errResponse(400, `API key not valid ${KEY}`) }),
    (e) => e instanceof AnthropicError && e.status === 400 && e.retryable === false && !e.message.includes(KEY),
  );
  for (const status of [429, 500, 503]) {
    await assert.rejects(callGemini({ model: "m", messages: [] }, { apiKey: KEY, fetchImpl: async () => errResponse(status, "x") }), (e) => e.retryable === true);
  }
});

test("a missing key is refused before any request", async () => {
  await assert.rejects(callGemini({ model: "m", messages: [] }, { apiKey: "", fetchImpl: async () => assert.fail("no request") }), AnthropicError);
});

test("redact also hides anything shaped like a Google key", () => {
  assert.equal(redact(`oops ${KEY} here`), "oops [redacted] here");
});

test("a quota error from a request with web search puts the way out first", async () => {
  const body = { model: "m", messages: [], tools: [{ type: "web_search_20250305", name: "web_search" }] };
  await assert.rejects(
    callGemini(body, { apiKey: KEY, fetchImpl: async () => errResponse(429, "You exceeded your current quota") }),
    (e) => /^This agent uses web search/.test(e.message) && e.message.includes("\n\nYou exceeded your current quota"),
  );
  await assert.rejects(
    callGemini({ model: "m", messages: [] }, { apiKey: KEY, fetchImpl: async () => errResponse(429, "You exceeded your current quota") }),
    (e) => e.message === "You exceeded your current quota",
  );
});
