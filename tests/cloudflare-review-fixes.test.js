import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanModelList } from "../public/js/engine/model-check.js";
import { PROVIDERS } from "../public/js/engine/providers.js";

test("Check models finds the three Cloudflare ids, which start with @", () => {
  const ids = PROVIDERS.cloudflare.models.map((m) => m.id);
  const out = cleanModelList(ids, "cloudflare");
  assert.deepEqual(out.catalogFound.sort(), [...ids].sort());
  assert.equal(out.total, 3);
});

import { readFileSync } from "node:fs";
import { createAgent } from "../public/js/engine/agent.js";
import { createBudget, LimitError } from "../public/js/engine/budget.js";
import { AnthropicError } from "../public/js/engine/anthropic.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { limitMessage } from "../public/js/engine/harness.js";
import { callCloudflare } from "../public/js/engine/cloudflare.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
const KEY = `${"0123456789abcdef".repeat(2)}:${"T".repeat(40)}`;

test("a Cloudflare quota answer stops the run as rate_pool, which says the pool is used up and when to continue", async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, headers: new Map(), json: async () => ({ errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons" }] }) });
  const call = (body) => callCloudflare(body, { apiKey: KEY, fetchImpl });
  const node = { id: "w", agent: "writer", model: "fast", search: false, slot: "cloudflare-free" };
  const agent = createAgent({ node, call, emit() {}, budget: createBudget(LIMIT_DEFAULTS), language: "en", sleep: async () => {}, retries: 1, retryDelaySec: 1 });
  const error = await agent.run("Task: x").catch((e) => e);
  assert.ok(error instanceof LimitError);
  assert.equal(error.reason, "rate_pool");
  assert.match(limitMessage("rate_pool", {}, { label: "Writer" }), /00:00 UTC/);
});

test("the rate_pool stop texts exist in both languages, differ, and name 00:00 UTC", () => {
  for (const key of ["run.outcome.stopped_limit.rate_pool", "player.stopReason.rate_pool"]) {
    assert.equal(typeof en[key], "string");
    assert.notEqual(en[key], cs[key]);
  }
  assert.match(en["run.outcome.stopped_limit.rate_pool"], /00:00 UTC/);
  assert.match(cs["run.outcome.stopped_limit.rate_pool"], /00:00 UTC/);
});

import { limitOffers } from "../public/js/engine/limits.js";
const LIMITS = { maxSteps: 90, maxTokens: 400000, maxSearches: 3 };
const chainOf = (n, slot, model, agent = "writer") => ({ pattern: "sequential", nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, agent, model, search: false, slot })), edges: Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })) });

test("an agent can move to a loaded free key of another provider when the pool is hit, but never to a key of the same provider", () => {
  const d = chainOf(25, "cloudflare-free", "strong");
  const withGroq = limitOffers({ design: d, limits: LIMITS, loadedSlots: ["cloudflare-free", "groq-free"] });
  const move = withGroq.find((o) => o.id === "move-agent");
  assert.ok(move, "a Groq free key is loaded");
  assert.equal(move.slot, "groq-free");
  assert.ok(move.after.length === 0 || !move.after.some((f) => f.kind === "day-neurons"));
  const sameProvider = limitOffers({ design: d, limits: LIMITS, loadedSlots: ["cloudflare-free", "cloudflare"] });
  assert.ok(!sameProvider.some((o) => o.id === "move-agent"), "the Cloudflare paid key is the paid-key offer, not a move");
});

test("offers that change nothing carry no new estimate, and shorter answers are not offered when they do not lower the pool use", () => {
  const slot = "cloudflare-free";
  const debate = { pattern: "debate", rounds: 10, nodes: [["a", "debater", "strong"], ["b", "debater", "strong"], ["c", "debater", "strong"], ["j", "judge", "balanced"]].map(([id, agent, model]) => ({ id, agent, model, search: false, slot })), edges: [] };
  const offers = limitOffers({ design: debate, limits: LIMITS, loadedSlots: [slot] });
  for (const id of ["tomorrow", "paid-key"]) assert.equal(offers.find((o) => o.id === id).estimate, undefined, id);
  assert.ok(!offers.some((o) => o.id === "shorter"), "the answers are already short in the estimate, so shorter answers change nothing");
  assert.ok(offers.find((o) => o.id === "lightest-model").estimate.neurons > 0);
});

import { limitFindings, limitSummary } from "../public/js/engine/limits.js";
import { limitsView } from "../public/js/create/limits-view.js";

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  append(...nodes) { this.children.push(...nodes); }
  get text() { return this.children.map((c) => c.text).join(" "); }
}
const fakeDoc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const tOf = (key, params = {}) => String(en[key] ?? `MISSING ${key}`).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
const labels = { openrouter: "OpenRouter", cloudflare: "Cloudflare", groq: "Groq" };
const viewOf = (design) => limitsView({ doc: fakeDoc, t: tOf, findings: limitFindings({ design, limits: LIMITS }), offers: [], summary: limitSummary({ design, limits: LIMITS }), providerName: "WRONG", providerNameOf: (id) => labels[id], nameOf: (id) => id, slotName: (s) => s, num: (n) => String(n), onApply() {} });

test("the fits line names the provider of the worst bucket, not the first free agent", () => {
  const design = { pattern: "sequential", nodes: [{ id: "o", agent: "writer", model: "fast", search: false, slot: "openrouter-free" }, ...["a", "b", "c"].map((id) => ({ id, agent: "writer", model: "strong", search: false, slot: "cloudflare-free" }))], edges: [] };
  const summary = limitSummary({ design, limits: LIMITS });
  assert.equal(summary.provider, "cloudflare");
  const text = viewOf(design).text;
  assert.match(text, /Cloudflare/);
  assert.doesNotMatch(text, /OpenRouter|WRONG/);
});

test("a finding names the provider whose limit it is", () => {
  const nodes = [{ id: "g", agent: "writer", model: "fast", search: false, slot: "groq-free" }, ...Array.from({ length: 80 }, (_, i) => ({ id: `n${i}`, agent: "writer", model: "balanced", search: false, slot: "cloudflare-free" }))];
  const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }));
  const found = limitFindings({ design: { pattern: "sequential", nodes, edges }, limits: LIMITS });
  assert.equal(found.find((f) => f.kind === "day-neurons").provider, "cloudflare");
  assert.match(viewOf({ pattern: "sequential", nodes, edges }).text, /Cloudflare/);
});

test("each agent on the free Cloudflare pool gets its own neuron number, and others get none", async () => {
  const { neuronsByAgent } = await import("../public/js/engine/limits.js");
  const design = { pattern: "sequential", nodes: [
    { id: "a", agent: "writer", model: "fast", search: false, slot: "cloudflare-free" },
    { id: "b", agent: "writer", model: "strong", search: false, slot: "cloudflare-free" },
    { id: "c", agent: "writer", model: "fast", search: false, slot: "groq-free" },
    { id: "d", agent: "writer", model: "fast", search: false, slot: "cloudflare" },
  ], edges: [] };
  const m = neuronsByAgent({ design, limits: LIMITS });
  assert.ok(m.get("b") > m.get("a") && m.get("a") > 0);
  assert.ok(!m.has("c") && !m.has("d"));
  for (const d of [en, cs]) assert.match(d["create.agentNeurons"], /\{n\}/);
  assert.notEqual(en["create.agentNeurons"], cs["create.agentNeurons"]);
});

test("the key hint and Help say the token needs the Workers AI permission, in both languages", () => {
  assert.match(en["settings.cloudflareKeyLink"], /Workers AI permission/);
  assert.match(cs["settings.cloudflareKeyLink"], /oprávněním Workers AI/);
  assert.match(en["help.body"], /Workers AI permission/);
  assert.match(cs["help.body"], /oprávněním Workers AI/);
});
