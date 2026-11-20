import { test } from "node:test";
import assert from "node:assert/strict";
import { checkModels, describeCheck, checkAllModels } from "../public/js/model-check-client.js";
import { MODELS, GOOGLE_MODELS } from "../public/js/engine/providers.js";

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
const KEY = "x".repeat(30);

test("checkModels posts the provider and the key and returns the list", async () => {
  const seen = [];
  const fetchFn = async (url, init) => {
    seen.push({ url, method: init.method, body: JSON.parse(init.body) });
    return reply(200, { ok: true, total: 5, ids: ["a"], catalogFound: [MODELS[0].id] });
  };
  const result = await checkModels({ provider: "anthropic", key: KEY, fetchFn });
  assert.deepEqual(result, { ok: true, total: 5, ids: ["a"], catalogFound: [MODELS[0].id] });
  assert.deepEqual(seen, [{ url: "/api/models", method: "POST", body: { provider: "anthropic", key: KEY } }]);
});

test("checkModels turns every failure into a short code", async () => {
  assert.deepEqual(await checkModels({ provider: "anthropic", key: KEY, fetchFn: async () => reply(502, { error: "rejected" }) }), { ok: false, error: "rejected" });
  assert.deepEqual(await checkModels({ provider: "anthropic", key: KEY, fetchFn: async () => reply(429, { error: "rate_limit" }) }), { ok: false, error: "rate_limit" });
  assert.deepEqual(await checkModels({ provider: "anthropic", key: KEY, fetchFn: async () => reply(400, { error: "bad_key" }) }), { ok: false, error: "bad_key" });
  assert.deepEqual(await checkModels({ provider: "anthropic", key: KEY, fetchFn: async () => { throw new Error("offline"); } }), { ok: false, error: "unreachable" });
  assert.deepEqual(await checkModels({ provider: "anthropic", key: KEY, fetchFn: async () => ({ ok: true, status: 200, json: async () => { throw new Error("html"); } }) }), { ok: false, error: "unreachable" });
  assert.deepEqual(await checkModels({ provider: "anthropic", key: KEY, fetchFn: async () => reply(500, { error: "weird" }) }), { ok: false, error: "unreachable" });
  assert.deepEqual(await checkModels({ provider: "anthropic", key: KEY, fetchFn: async () => reply(200, { ok: true, total: "x" }) }), { ok: false, error: "unreachable" });
});

test("a free key is compared with the models of the free tier only, a paid key with all", () => {
  const found = { ok: true, total: 30, ids: [], catalogFound: [GOOGLE_MODELS[0].id, GOOGLE_MODELS[1].id] };
  const free = describeCheck("google-free", found);
  assert.equal(free.state, "ok");
  assert.deepEqual(free.rows.map((r) => r.tier), ["fast", "balanced"]);
  assert.equal(free.others, 28);
  const paid = describeCheck("google", found);
  assert.equal(paid.state, "missing");
  assert.equal(paid.missing, 1);
  assert.deepEqual(paid.rows.map((r) => [r.tier, r.available]), [["fast", true], ["balanced", true], ["strong", false]]);
  assert.equal(paid.rows[2].id, GOOGLE_MODELS[2].id);
  assert.equal(paid.others, 28);
});

test("others is never negative, and an error result stays an error", () => {
  const odd = describeCheck("anthropic", { ok: true, total: 1, ids: [], catalogFound: MODELS.map((m) => m.id) });
  assert.equal(odd.others, 0);
  assert.equal(odd.state, "ok");
  const failed = describeCheck("anthropic", { ok: false, error: "rejected" });
  assert.equal(failed.state, "error");
  assert.equal(failed.error, "rejected");
});

test("checkAllModels skips slots without a key, goes one after the other and survives a failure", async () => {
  const order = [];
  let running = 0;
  const fetchFn = async (url, init) => {
    const { provider, key } = JSON.parse(init.body);
    running += 1;
    assert.equal(running, 1, "never two checks at once");
    order.push(`${provider}:${key}`);
    await new Promise((r) => setTimeout(r, 5));
    running -= 1;
    return key === "BAD".padEnd(25, "b") ? reply(502, { error: "rejected" }) : reply(200, { ok: true, total: 3, ids: [], catalogFound: [] });
  };
  const keys = { anthropic: "BAD".padEnd(25, "b"), "google-free": KEY, google: null };
  const out = await checkAllModels({ keys, fetchFn });
  assert.deepEqual(out.map((o) => o.slot), ["anthropic", "google-free", "google", "groq-free", "groq"]);
  assert.equal(out[0].result.error, "rejected");
  assert.equal(out[1].result.ok, true);
  assert.deepEqual(out[2], { slot: "google", skipped: true });
  assert.equal(order.length, 2);
  assert.deepEqual((await checkAllModels({ keys: {}, fetchFn })).map((o) => o.skipped), [true, true, true, true, true]);
});
