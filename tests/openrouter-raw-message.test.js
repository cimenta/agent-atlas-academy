import { test } from "node:test";
import assert from "node:assert/strict";
import { callChatCompletions } from "../public/js/engine/openai-compat.js";

const body = { model: "m", max_tokens: 10, messages: [{ role: "user", content: "hi" }] };
const reply = (status, data) => async () => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

test("an OpenRouter 429 shows the words of the model's provider and marks a shared pool", async () => {
  const data = { error: { message: "Provider returned error", code: 429, metadata: { raw: "gemma is temporarily rate-limited upstream", limit_source: "upstream_provider_shared_pool" } } };
  await assert.rejects(() => callChatCompletions(body, { apiKey: "k", url: "https://x.test/v1/chat/completions", fetchImpl: reply(429, data) }), (e) => e.status === 429 && /temporarily rate-limited upstream/.test(e.message) && e.sharedPool === true);
});

test("an answer without metadata keeps its own message and is not a shared pool", async () => {
  await assert.rejects(() => callChatCompletions(body, { apiKey: "k", url: "https://x.test/v1/chat/completions", fetchImpl: reply(429, { error: { message: "slow down" } }) }), (e) => e.message === "slow down" && e.sharedPool === undefined);
});
