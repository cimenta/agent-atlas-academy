import { test } from "node:test";
import assert from "node:assert/strict";
import { createModelsHandler } from "../lib/models-handler.js";
import { AnthropicError } from "../public/js/engine/anthropic.js";
import { MODELS } from "../public/js/engine/providers.js";
import { MODEL_CHECKS_PER_HOUR } from "../public/js/engine/catalog.js";

const ANT = "sk-ant-api03-" + "k".repeat(30);
const GOO = "AIzaSy" + "g".repeat(33);
const fakeResponse = () => ({ statusCode: 0, headers: {}, chunks: [], setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, write(c) { this.chunks.push(c); }, end(c) { if (c) this.chunks.push(c); this.ended = true; }, on() {} });
const request = (body, address = "1.1.1.1", method = "POST") => ({ method, headers: { "x-forwarded-for": address }, socket: {}, body });
const answer = (res) => JSON.parse(res.chunks.join(""));
const ask = async (handler, body, address) => {
  const res = fakeResponse();
  await handler(request(body, address), res);
  return res;
};
const lists = (anthropic = async () => [], google = async () => []) => ({ anthropic, google });

test("a good list is cleaned and returned", async () => {
  const handler = createModelsHandler({ lists: lists(async () => [MODELS[0].id, "other-model", 5, "bad id"]), rateLimitImpl: () => true });
  const res = await ask(handler, { provider: "anthropic", key: ANT });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(answer(res), { ok: true, total: 2, ids: [MODELS[0].id, "other-model"], catalogFound: [MODELS[0].id] });
  assert.equal(res.headers["cache-control"], "no-store");
});

test("the list function gets the key and the right provider is asked", async () => {
  const seen = [];
  const handler = createModelsHandler({ lists: lists(async (o) => (seen.push(["anthropic", o.apiKey]), []), async (o) => (seen.push(["google", o.apiKey]), [])), rateLimitImpl: () => true });
  await ask(handler, { provider: "google", key: GOO });
  await ask(handler, { provider: "anthropic", key: ANT });
  assert.deepEqual(seen, [["google", GOO], ["anthropic", ANT]]);
});

test("bad requests are refused", async () => {
  const handler = createModelsHandler({ lists: lists(), rateLimitImpl: () => true });
  assert.equal((await ask(handler, { provider: "nope", key: ANT })).statusCode, 400);
  assert.equal(answer(await ask(handler, { provider: "nope", key: ANT })).error, "bad_provider");
  assert.equal(answer(await ask(handler, { provider: "anthropic", key: "short" })).error, "bad_key");
  assert.equal(answer(await ask(handler, { provider: "google", key: "sk-ant-" + "x".repeat(30) })).error, "bad_key");
  assert.equal(answer(await ask(handler, "{not json")).error, "bad_json");
  assert.equal(answer(await ask(handler, "[1]")).error, "bad_json");
  const get = fakeResponse();
  await handler(request({}, "1.1.1.1", "GET"), get);
  assert.equal(get.statusCode, 405);
  assert.equal((await ask(handler, { provider: "anthropic", key: ANT, pad: "x".repeat(5000) })).statusCode, 413);
});

test("a refusal by the provider and any other failure are told apart", async () => {
  const refuse = (status) => async () => {
    throw new AnthropicError(`failed with ${ANT}`, { status });
  };
  for (const status of [401, 403]) {
    const res = await ask(createModelsHandler({ lists: lists(refuse(status)), rateLimitImpl: () => true }), { provider: "anthropic", key: ANT });
    assert.equal(res.statusCode, 502);
    assert.equal(answer(res).error, "rejected");
  }
  for (const status of [0, 500, 429]) {
    const res = await ask(createModelsHandler({ lists: lists(refuse(status)), rateLimitImpl: () => true }), { provider: "anthropic", key: ANT });
    assert.equal(res.statusCode, 502);
    assert.equal(answer(res).error, "unreachable");
  }
  const odd = await ask(createModelsHandler({ lists: lists(async () => { throw new Error("boom"); }), rateLimitImpl: () => true }), { provider: "anthropic", key: ANT });
  assert.equal(answer(odd).error, "unreachable");
});

test("the key is never in an answer", async () => {
  const handler = createModelsHandler({ lists: lists(async () => { throw new AnthropicError(`bad ${ANT}`, { status: 401 }); }), rateLimitImpl: () => true });
  const res = await ask(handler, { provider: "anthropic", key: ANT });
  assert.ok(!res.chunks.join("").includes(ANT));
  const echo = createModelsHandler({ lists: lists(async () => [ANT, "fine-model"]), rateLimitImpl: () => true });
  const res2 = await ask(echo, { provider: "anthropic", key: ANT });
  assert.ok(!res2.chunks.join("").includes(ANT), "a list that echoes the key is cleaned too");
});

test("a huge list gives at most 200 ids", async () => {
  const handler = createModelsHandler({ lists: lists(async () => Array.from({ length: 100000 }, (_, i) => `m${i}`)), rateLimitImpl: () => true });
  const body = answer(await ask(handler, { provider: "anthropic", key: ANT }));
  assert.equal(body.ids.length, 200);
  assert.equal(body.total, 100000);
});

test("one address may check only so often in an hour", async () => {
  const handler = createModelsHandler({ lists: lists() });
  const address = "9.9.9.9";
  for (let i = 0; i < MODEL_CHECKS_PER_HOUR; i++) assert.equal((await ask(handler, { provider: "anthropic", key: ANT }, address)).statusCode, 200);
  const res = await ask(handler, { provider: "anthropic", key: ANT }, address);
  assert.equal(res.statusCode, 429);
  assert.equal(answer(res).error, "rate_limit");
  assert.equal((await ask(handler, { provider: "anthropic", key: ANT }, "8.8.8.8")).statusCode, 200);
});

test("a key that the provider refuses with a 400 (Google bad key) is told as rejected", async () => {
  const handler = createModelsHandler({ lists: lists(async () => { throw new AnthropicError(`bad ${ANT}`, { status: 400 }); }), rateLimitImpl: () => true });
  const res = await ask(handler, { provider: "anthropic", key: ANT });
  assert.equal(res.statusCode, 502);
  assert.equal(answer(res).error, "rejected");
});
