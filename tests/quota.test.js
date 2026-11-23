import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFreeQuota, nextResetUtc } from "../public/js/engine/quota.js";
import { createQuotaHandler, QUOTA_CHECKS_PER_HOUR } from "../lib/quota-handler.js";
import { fetchQuota, createQuotaStore, quotaLevelOf, quotaTitle } from "../public/js/quota-client.js";
import { AnthropicError } from "../public/js/engine/anthropic.js";

const KEY = "sk-or-v1-" + "k".repeat(40);
const fakeResponse = () => ({ statusCode: 0, headers: {}, chunks: [], setHeader(k, v) { this.headers[k.toLowerCase()] = v; }, write(c) { this.chunks.push(c); }, end(c) { if (c) this.chunks.push(c); }, on() {} });
const ask = async (handler, body, address = "1.1.1.1", method = "POST") => {
  const res = fakeResponse();
  await handler({ method, headers: { "x-forwarded-for": address }, socket: {}, body }, res);
  return { status: res.statusCode, body: JSON.parse(res.chunks.join("") || "null"), headers: res.headers, text: res.chunks.join("") };
};

test("the free requests are read from the answer of OpenRouter, in either shape", () => {
  assert.deepEqual(parseFreeQuota({ data: { free_model_daily_requests: { used: 12, limit: 50, remaining: 38 } } }), { used: 12, limit: 50, remaining: 38 });
  assert.deepEqual(parseFreeQuota({ free_model_daily_requests: { used: 3, limit: 50 } }), { used: 3, limit: 50, remaining: 47 });
  assert.deepEqual(parseFreeQuota({ data: { free_model_daily_requests: { limit: 50, remaining: 7 } } }), { used: 43, limit: 50, remaining: 7 });
});

test("an answer that does not say, or says nonsense, gives nothing", () => {
  for (const bad of [null, {}, { data: {} }, { data: { free_model_daily_requests: "many" } }, { data: { free_model_daily_requests: { used: -1, limit: 50 } } }, { data: { free_model_daily_requests: { used: "3", limit: 50 } } }, { data: { free_model_daily_requests: { used: 1, limit: 0 } } }]) assert.equal(parseFreeQuota(bad), null);
});

test("the count starts again at the next midnight UTC", () => {
  assert.equal(nextResetUtc(new Date("2026-11-23T19:42:10Z")), "2026-11-24T00:00:00.000Z");
});

test("the server answers three numbers and the reset time, and never the key", async () => {
  const seen = [];
  const handler = createQuotaHandler({ readKey: async (o) => (seen.push(o.apiKey), { data: { label: KEY, free_model_daily_requests: { used: 12, limit: 50, remaining: 38 } } }), rateLimitImpl: () => true, now: () => new Date("2026-11-23T10:00:00Z") });
  const r = await ask(handler, { provider: "openrouter", key: KEY });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, used: 12, limit: 50, remaining: 38, resetsAt: "2026-11-24T00:00:00.000Z" });
  assert.deepEqual(seen, [KEY]);
  assert.ok(!r.text.includes(KEY));
  assert.equal(r.headers["cache-control"], "no-store");
});

test("the server refuses bad requests and reports provider trouble", async () => {
  const handler = createQuotaHandler({ readKey: async () => ({}), rateLimitImpl: () => true });
  assert.equal((await ask(handler, {}, "1", "GET")).status, 405);
  assert.equal((await ask(handler, "not json")).body.error, "bad_json");
  assert.equal((await ask(handler, { provider: "groq", key: KEY })).body.error, "bad_provider");
  assert.equal((await ask(handler, { provider: "openrouter", key: "short" })).body.error, "bad_key");
  assert.deepEqual((await ask(handler, { provider: "openrouter", key: KEY })).body, { ok: false, error: "unknown" });
  const rejected = createQuotaHandler({ readKey: async () => { throw new AnthropicError("no", { status: 401 }); }, rateLimitImpl: () => true });
  assert.deepEqual([(await ask(rejected, { provider: "openrouter", key: KEY })).status, (await ask(rejected, { provider: "openrouter", key: KEY })).body.error], [502, "rejected"]);
  const down = createQuotaHandler({ readKey: async () => { throw new Error("net"); }, rateLimitImpl: () => true });
  assert.equal((await ask(down, { provider: "openrouter", key: KEY })).body.error, "unreachable");
});

test("one address may ask only so many times an hour", async () => {
  const handler = createQuotaHandler({ readKey: async () => ({ data: { free_model_daily_requests: { used: 1, limit: 50, remaining: 49 } } }) });
  let last;
  for (let i = 0; i <= QUOTA_CHECKS_PER_HOUR; i++) last = await ask(handler, { provider: "openrouter", key: KEY }, "9.9.9.9");
  assert.equal(last.status, 429);
});

const reply = (data, ok = true) => async () => ({ ok, json: async () => data });

test("the client turns the answer into a result and never throws", async () => {
  assert.deepEqual(await fetchQuota({ key: KEY, fetchFn: reply({ ok: true, used: 1, limit: 50, remaining: 49, resetsAt: "x" }) }), { ok: true, used: 1, limit: 50, remaining: 49, resetsAt: "x" });
  assert.deepEqual(await fetchQuota({ key: KEY, fetchFn: reply({ ok: false, error: "rejected" }, false) }), { ok: false, error: "rejected" });
  assert.deepEqual(await fetchQuota({ key: KEY, fetchFn: reply({ ok: true, used: "1" }) }), { ok: false, error: "unreachable" });
  assert.deepEqual(await fetchQuota({ key: KEY, fetchFn: async () => { throw new Error("x"); } }), { ok: false, error: "unreachable" });
});

test("the store remembers the answer with its time, shares one question and tells the listeners", async () => {
  let calls = 0;
  const store = createQuotaStore({ fetchFn: async () => (calls++, { ok: true, json: async () => ({ ok: true, used: 2, limit: 50, remaining: 48 }) }), now: () => new Date("2026-11-23T10:00:00Z") });
  const heard = [];
  store.subscribe((slot) => heard.push([slot, store.busy(slot)]));
  const [a, b] = [store.refresh("or", KEY), store.refresh("or", KEY)];
  assert.equal(a, b);
  await a;
  assert.equal(calls, 1);
  assert.equal(store.get("or").result.remaining, 48);
  assert.equal(store.get("or").at.toISOString(), "2026-11-23T10:00:00.000Z");
  assert.deepEqual(heard, [["or", true], ["or", false]]);
  await store.refresh("or", KEY);
  assert.equal(calls, 2);
  await store.refresh("or", null);
  assert.equal(store.get("or"), null);
});

test("the level is out at none left, low at five or fewer, and the tooltip names the reset only when out", () => {
  assert.deepEqual([50, 6, 5, 1, 0].map((remaining) => quotaLevelOf({ remaining })), ["ok", "ok", "low", "low", "out"]);
  const t = (key, p = {}) => `${key}:${JSON.stringify(p)}`;
  assert.ok(!quotaTitle(t, { at: new Date(), result: { used: 1, limit: 50, remaining: 49, resetsAt: null } }).includes("quota.resets"));
  assert.ok(quotaTitle(t, { at: new Date(), result: { used: 50, limit: 50, remaining: 0, resetsAt: "2026-11-24T00:00:00.000Z" } }).includes("quota.resets"));
});
