import { test } from "node:test";
import assert from "node:assert/strict";
import { splitCloudflareKey, callCloudflare, listCloudflareModels, QUOTA_PATTERN } from "../public/js/engine/cloudflare.js";
import { recordingFetch } from "../public/js/engine/api-log.js";
import { redact } from "../public/js/engine/anthropic.js";
import { providerCalls } from "../lib/provider-calls.js";
import { createModelsHandler } from "../lib/models-handler.js";

const ACCOUNT = "0123456789abcdef0123456789abcdef";
const TOKEN = "AbCdEf_0123456789-AbCdEf_0123456789-xyz";
const KEY = `${ACCOUNT}:${TOKEN}`;
const body = { model: "@cf/openai/gpt-oss-120b", max_tokens: 300, system: "s", messages: [{ role: "user", content: [{ type: "text", text: "q" }] }] };
const ok = { choices: [{ message: { role: "assistant", content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } };
const reply = (status, data, headers = {}) => async () => ({ ok: status < 400, status, headers: new Map(Object.entries(headers)), json: async () => data });

test("splitCloudflareKey splits at the first colon and refuses a bad key", () => {
  assert.deepEqual(splitCloudflareKey(KEY), { accountId: ACCOUNT, token: TOKEN });
  assert.deepEqual(splitCloudflareKey(`  ${KEY}\n`), { accountId: ACCOUNT, token: TOKEN });
  assert.deepEqual(splitCloudflareKey(`${ACCOUNT}:ab:cd`), { accountId: ACCOUNT, token: "ab:cd" });
  assert.deepEqual(splitCloudflareKey(`${ACCOUNT.toUpperCase()}:${TOKEN}`), { accountId: ACCOUNT, token: TOKEN });
  for (const bad of [TOKEN, ACCOUNT, `${ACCOUNT}:`, `${ACCOUNT.slice(1)}:${TOKEN}`, "", null, undefined, 42]) assert.equal(splitCloudflareKey(bad), null, String(bad));
});

test("callCloudflare posts to the account address with the bearer token and max_completion_tokens", async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init, sent: JSON.parse(init.body) }; return reply(200, ok)(); };
  const answer = await callCloudflare(body, { apiKey: KEY, fetchImpl });
  assert.equal(seen.url, `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/v1/chat/completions`);
  assert.equal(seen.init.headers.authorization, `Bearer ${TOKEN}`);
  assert.equal(seen.sent.model, "@cf/openai/gpt-oss-120b");
  assert.equal(seen.sent.max_completion_tokens, 300);
  assert.equal("max_tokens" in seen.sent, false);
  assert.equal("reasoning_effort" in seen.sent, false);
  assert.equal(answer.content[0].text, "hi");
  assert.equal(answer.usage.input_tokens, 10);
});

test("a key that does not split sends nothing and the message names the format", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return reply(200, ok)(); };
  await assert.rejects(() => callCloudflare(body, { apiKey: TOKEN, fetchImpl }), /ACCOUNT_ID:TOKEN/);
  assert.equal(calls, 0);
});

test("a daily allocation answer on 429 and on 400 stops as a day limit; a 401 about the token and a 400 about the model do not", async () => {
  const quota = "you have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan.";
  for (const status of [429, 400]) {
    await assert.rejects(() => callCloudflare(body, { apiKey: KEY, fetchImpl: reply(status, { errors: [{ code: 4006, message: quota }] }) }), (e) => e.status === 429 && e.rateKind === "day" && e.retryAfterSec === null);
  }
  await assert.rejects(() => callCloudflare(body, { apiKey: KEY, fetchImpl: reply(401, { errors: [{ code: 10000, message: "Authentication error" }] }) }), (e) => e.status === 401 && e.rateKind === undefined);
  await assert.rejects(() => callCloudflare(body, { apiKey: KEY, fetchImpl: reply(400, { errors: [{ code: 5007, message: "No such model @cf/x/y" }] }) }), (e) => e.status === 400 && e.rateKind === undefined);
  await assert.rejects(() => callCloudflare(body, { apiKey: KEY, fetchImpl: reply(401, { error: { message: "token is bad for neurons" } }) }), (e) => e.status === 401);
  assert.match("daily free allocation", QUOTA_PATTERN);
});

test("neither the token nor the account id is ever in an error message, and the API log shows {account}", async () => {
  const leaky = `bad ${TOKEN} for account ${ACCOUNT} at /accounts/${ACCOUNT}/ai`;
  await assert.rejects(() => callCloudflare(body, { apiKey: KEY, fetchImpl: reply(500, { errors: [{ message: leaky }] }) }), (e) => !e.message.includes(TOKEN) && !e.message.includes(ACCOUNT));
  await assert.rejects(() => callCloudflare(body, { apiKey: KEY, fetchImpl: async () => { throw new Error(leaky); } }), (e) => !e.message.includes(TOKEN) && !e.message.includes(ACCOUNT));
  assert.doesNotMatch(redact(`/accounts/${ACCOUNT}/ai/v1`), new RegExp(ACCOUNT));
  const sink = [];
  const recorded = recordingFetch(sink, { baseFetch: reply(200, ok) });
  await callCloudflare(body, { apiKey: KEY, fetchImpl: recorded });
  assert.equal(sink[0].url, "https://api.cloudflare.com/client/v4/accounts/{account}/ai/v1/chat/completions");
  assert.doesNotMatch(JSON.stringify(sink), new RegExp(`${TOKEN}|${ACCOUNT}`));
});

test("the list of models is read from the account address", async () => {
  let url;
  const ids = await listCloudflareModels({ apiKey: KEY, fetchImpl: async (u) => { url = u; return reply(200, { result: [{ name: "@cf/openai/gpt-oss-120b" }, { name: "@cf/qwen/qwen3.8-27b" }] })(); } });
  assert.match(url, new RegExp(`/accounts/${ACCOUNT}/ai/models/search`));
  assert.deepEqual(ids, ["@cf/openai/gpt-oss-120b", "@cf/qwen/qwen3.8-27b"]);
});

test("the run handler map has a call for cloudflare and the models route needs a key of the right shape", async () => {
  const marker = async () => ({});
  assert.equal(providerCalls({ callCloudflare: marker }).cloudflare, marker);
  const run = (payload) => new Promise((resolve) => {
    const handler = createModelsHandler({ lists: { cloudflare: async () => ["@cf/openai/gpt-oss-120b"] }, rateLimitImpl: () => true });
    const res = { statusCode: 0, headers: {}, setHeader() {}, end(text) { resolve({ status: this.statusCode, body: JSON.parse(text) }); } };
    handler({ method: "POST", body: payload, headers: {}, socket: { remoteAddress: "1.1.1.1" } }, res);
  });
  assert.equal((await run({ provider: "cloudflare" })).status, 400);
  assert.equal((await run({ provider: "cloudflare", key: TOKEN })).status, 400);
  const good = await run({ provider: "cloudflare", key: KEY });
  assert.equal(good.status, 200);
  assert.doesNotMatch(JSON.stringify(good.body), new RegExp(`${TOKEN}|${ACCOUNT}`));
});

test("the code 4006 makes a quota answer; the digits 4006 inside another message do not", async () => {
  await assert.rejects(() => callCloudflare(body, { apiKey: KEY, fetchImpl: reply(400, { errors: [{ code: 4006, message: "limit reached" }] }) }), (e) => e.status === 429 && e.rateKind === "day");
  await assert.rejects(() => callCloudflare(body, { apiKey: KEY, fetchImpl: reply(400, { errors: [{ code: 5001, message: "the request is too long: 34006 tokens" }] }) }), (e) => e.status === 400 && e.rateKind === undefined);
});
