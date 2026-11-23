import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAgent } from "../public/js/engine/agent.js";
import { createBudget, LimitError } from "../public/js/engine/budget.js";
import { AnthropicError } from "../public/js/engine/anthropic.js";
import { LIMIT_DEFAULTS, RATE_WAIT_MAX_SEC } from "../public/js/engine/catalog.js";
import { limitMessage } from "../public/js/engine/harness.js";

const ok = { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } };
const rate = (extra = {}) => Object.assign(new AnthropicError("Rate limit reached", { status: 429, retryable: true }), { retryAfterSec: 23, rateKind: "minute" }, extra);

function setup(replies, slot = "groq-free") {
  const sleeps = [];
  const events = [];
  const call = async () => {
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const node = { id: "w", agent: "writer", model: "fast", search: false, ...(slot ? { slot } : {}) };
  const agent = createAgent({ node, call, emit: (e) => events.push(e), budget: createBudget(LIMIT_DEFAULTS), language: "en", sleep: async (ms) => sleeps.push(ms), retries: 1, retryDelaySec: 1.5 });
  return { agent, sleeps, events };
}

test("a short 429 on a free Groq slot waits what Groq asked for, says so, and goes on", async () => {
  const { agent, sleeps, events } = setup([rate(), ok]);
  const result = await agent.run("Task: x");
  assert.equal(result.text, "ok");
  assert.deepEqual(sleeps, [23000]);
  const warning = events.find((e) => e.type === "warning" && e.rateWait);
  assert.equal(warning.rateWait, 23);
  assert.match(warning.message, /23 s/);
});

test("short 429 waits do not use up the normal retries", async () => {
  const { agent, sleeps } = setup([rate({ retryAfterSec: 5 }), rate({ retryAfterSec: 6 }), new AnthropicError("busy", { status: 529, retryable: true }), ok]);
  assert.equal((await agent.run("Task: x")).text, "ok");
  assert.deepEqual(sleeps, [5000, 6000, 1500]);
});

test("a 429 with no or a bad wait waits the retry delay, never NaN", async () => {
  const { agent, sleeps } = setup([rate({ retryAfterSec: null }), ok]);
  await agent.run("Task: x");
  assert.deepEqual(sleeps, [1500]);
});

test("a day limit stops the run at once with rate_day", async () => {
  const { agent, sleeps } = setup([rate({ rateKind: "day", retryAfterSec: 21600 })]);
  const error = await agent.run("Task: x").catch((e) => e);
  assert.ok(error instanceof LimitError);
  assert.equal(error.reason, "rate_day");
  assert.equal(error.value, 21600);
  assert.deepEqual(sleeps, []);
});

test("a wait longer than the most the app waits by itself also stops the run", async () => {
  const { agent, sleeps } = setup([rate({ retryAfterSec: RATE_WAIT_MAX_SEC + 1 })]);
  const error = await agent.run("Task: x").catch((e) => e);
  assert.equal(error.reason, "rate_day");
  assert.deepEqual(sleeps, []);
  assert.equal(RATE_WAIT_MAX_SEC, 60);
});

test("the fourth short wait in a row stops the run", async () => {
  const { agent, sleeps } = setup([rate(), rate(), rate(), rate()]);
  const error = await agent.run("Task: x").catch((e) => e);
  assert.equal(error.reason, "rate_day");
  assert.equal(sleeps.length, 3);
});

test("a 429 on a provider without free limits keeps the normal retries", async () => {
  const { agent, sleeps, events } = setup([rate({ retryAfterSec: 23 }), ok], "anthropic");
  await agent.run("Task: x");
  assert.deepEqual(sleeps, [1500]);
  assert.equal(events.some((e) => e.rateWait), false);
});

test("the stop is worded and translated", () => {
  assert.match(limitMessage("rate_day", {}, { label: "Writer", value: 21600 }), /6 h/);
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  for (const k of ["run.outcome.stopped_limit.rate_day", "player.stopReason.rate_day"]) {
    assert.equal(typeof en[k], "string", k);
    assert.notEqual(en[k], cs[k], k);
  }
});

test("a pool quota answer stops the run even on a paid slot (a free account key saved there)", async () => {
  const { agent, sleeps } = setup([rate({ rateKind: "day", pool: true, retryAfterSec: null })], "cloudflare");
  const error = await agent.run("Task: x").catch((e) => e);
  assert.ok(error instanceof LimitError);
  assert.equal(error.reason, "rate_pool");
  assert.deepEqual(sleeps, []);
});

test("a retry-after of 0 waits at least one second, not zero", async () => {
  const { agent, sleeps } = setup([rate({ retryAfterSec: 0 }), ok]);
  await agent.run("Task: x");
  assert.deepEqual(sleeps, [1000]);
});

test("after the short waits ran out the message says the provider kept refusing, not that its wait is longer", () => {
  const text = limitMessage("rate_day", {}, { label: "Writer", value: 5 });
  assert.doesNotMatch(text, /longer than the app waits/);
  assert.match(text, /kept refusing/);
});

test("a shared-pool 429 stops the run with the provider's own words and says the limit is not the student's", async () => {
  const same = () => rate({ retryAfterSec: null, sharedPool: true, message: "gemma is temporarily rate-limited upstream" });
  const { agent, events } = setup([same(), same(), same(), same()]);
  const error = await agent.run("Task: x").catch((e) => e);
  assert.ok(error instanceof LimitError);
  assert.equal(error.shared, true);
  assert.match(error.providerMessage, /gemma is temporarily/);
  const warning = events.find((e) => e.type === "warning" && e.rateWait);
  assert.match(warning.message, /The provider says: gemma is temporarily/);
  const text = limitMessage("rate_day", LIMIT_DEFAULTS, { label: "Writer", value: null, shared: error.shared, providerMessage: "Gemma is limited" });
  assert.match(text, /shares it among all its users/);
  assert.match(text, /The provider says: Gemma is limited/);
});
