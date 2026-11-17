import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAgent } from "../public/js/engine/agent.js";
import { createBudget } from "../public/js/engine/budget.js";
import { AnthropicError } from "../public/js/engine/anthropic.js";
import { FALLBACK_MODES, FALLBACK_DEFAULT, clampFallback, fallbackModelFor, LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { retryChoices } from "../public/js/replay/retry-choice.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { warningHelp } from "../public/js/help-ids.js";
import { findSection } from "../public/js/help-topics.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));

const busy = () => new AnthropicError("overloaded", { status: 529, retryable: true });
const bad = () => new AnthropicError("invalid x-api-key", { status: 401, retryable: false });
const ok = (t = "ok") => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 100000, output_tokens: 0 } });
const node = (extra = {}) => ({ id: "w", agent: "critic", model: "fast", search: false, ...extra });

function setup({ replies, fallback, nodeExtra, retries = 1 }) {
  const calls = [];
  const events = [];
  const call = async (body) => {
    calls.push(body.model);
    const next = replies.shift();
    if (next instanceof Error) throw next;
    return next;
  };
  const budget = createBudget({ ...LIMIT_DEFAULTS, maxTokens: 150000 });
  const agent = createAgent({ node: node(nodeExtra), call, emit: (e) => events.push(e), budget, sleep: async () => {}, retries, fallback });
  return { agent, calls, events, budget };
}

test("the fallback modes are off, suggest and auto, and anything else becomes suggest", () => {
  assert.deepEqual(FALLBACK_MODES, ["off", "suggest", "auto"]);
  assert.equal(FALLBACK_DEFAULT, "suggest");
  assert.equal(clampFallback("auto"), "auto");
  assert.equal(clampFallback("off"), "off");
  assert.equal(clampFallback("x"), "suggest");
  assert.equal(clampFallback(undefined), "suggest");
});

test("the fallback is another model of the same provider, never costlier than Balanced", () => {
  assert.equal(fallbackModelFor(node({ model: "fast" }), "anthropic").key, "balanced");
  assert.equal(fallbackModelFor(node({ model: "balanced" }), "anthropic").key, "fast");
  assert.equal(fallbackModelFor(node({ model: "strong" }), "anthropic").key, "balanced");
  assert.equal(fallbackModelFor(node({ model: "fast", slot: "google-free" }), "anthropic").id.startsWith("gemini"), true);
});

test("a free Gemini key is never switched to a model that needs a paid key", () => {
  const free = node({ model: "balanced", slot: "google-free" });
  assert.equal(fallbackModelFor(free, "google", true).key, "fast");
  assert.equal(fallbackModelFor(node({ model: "fast", slot: "google-free" }), "google", true).key, "balanced");
});

test("with auto, an agent that is out of tries gets one more try on another model, with a warning", async () => {
  const { agent, calls, events } = setup({ fallback: "auto", replies: [busy(), busy(), ok()] });
  const result = await agent.run("t");
  assert.equal(result.text, "ok");
  assert.deepEqual(calls, ["claude-haiku-5-5", "claude-haiku-5-5", "claude-sonnet-5-5"]);
  const warning = events.find((e) => e.type === "warning" && e.fallback);
  assert.deepEqual(warning.fallback, { from: "claude-haiku-5-5", to: "claude-sonnet-5-5" });
  assert.equal(warningHelp(warning), "harness-fallback");
});

test("after the switch the cost follows the model that answered", async () => {
  const { agent, budget } = setup({ fallback: "auto", replies: [busy(), busy(), ok()] });
  await agent.run("t");
  // 100,000 input tokens on Balanced is 0.30 dollars; on Fast it would be 0.10.
  assert.ok(Math.abs(budget.spentUsd() - 0.3) < 1e-6, String(budget.spentUsd()));
});

test("the switch happens once: a second failure on the new model throws", async () => {
  const { agent, calls } = setup({ fallback: "auto", replies: [busy(), busy(), busy(), ok()] });
  await assert.rejects(agent.run("t"), (e) => e instanceof AnthropicError);
  assert.equal(calls.length, 3);
});

test("with off or suggest the run fails as before, and a wrong key is never switched", async () => {
  for (const fallback of ["off", "suggest", undefined]) {
    const { agent, calls } = setup({ fallback, replies: [busy(), busy(), ok()] });
    await assert.rejects(agent.run("t"), (e) => e instanceof AnthropicError);
    assert.equal(calls.length, 2);
  }
  const { agent, calls } = setup({ fallback: "auto", replies: [bad(), ok()] });
  await assert.rejects(agent.run("t"), (e) => e instanceof AnthropicError);
  assert.equal(calls.length, 1);
});

test("the Retry menu marks the suggested model only when asked to", () => {
  const design = { pattern: "sequential", nodes: [{ id: "w", agent: "critic", model: "fast", search: false }], edges: [] };
  const on = retryChoices(design, "w", "anthropic", { suggest: true }).filter((c) => c.suggested);
  assert.equal(on.length, 1);
  assert.equal(on[0].id, "claude-sonnet-5-5");
  assert.equal(retryChoices(design, "w", "anthropic").some((c) => c.suggested), false);
});

test("the fallback setting is suggest by default, is kept and is clipped", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const store = createSettingsStore(storage);
  assert.equal(store.get().fallback, "suggest");
  store.setFallback("auto");
  assert.equal(createSettingsStore(storage).get().fallback, "auto");
  store.setFallback("bogus");
  assert.equal(store.get().fallback, "suggest");
});

test("the fallback texts and Help section exist in both languages", () => {
  for (const [lang, locale] of [["en", en], ["cs", cs]]) {
    const found = findSection(locale["help.body"], "harness-fallback");
    assert.ok(found, lang);
    for (const rid of found.section.related) assert.ok(findSection(locale["help.body"], rid), `${lang} ${rid}`);
    for (const k of ["harness.fallbackHeading", "harness.fallbackIntro", "harness.fallbackDefault", "player.retrySuggested", ...FALLBACK_MODES.flatMap((m) => [`harness.fallback.${m}`, `harness.fallback.${m}Hint`])]) assert.ok(locale[k], `${lang} ${k}`);
  }
});
