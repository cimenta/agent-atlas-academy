import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { limitFindings, limitOffers, limitSummary } from "../public/js/engine/limits.js";
import { limitsView } from "../public/js/create/limits-view.js";
import { PROVIDERS } from "../public/js/engine/providers.js";

const LIMITS = { maxSteps: 60, maxTokens: 150000, maxSearches: 3 };
const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
const chain = (n, slot = "openrouter-free", model = "fast") => ({
  pattern: "sequential",
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, agent: "writer", model, search: false, slot })),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
});
const find = (design, extra = {}) => limitFindings({ design, limits: LIMITS, ...extra });

test("72 calls on the free OpenRouter account are over the 50 requests a day, counted for the account", () => {
  const f = find(chain(72));
  assert.deepEqual(f.map((x) => x.kind), ["day-requests"]);
  assert.deepEqual(f[0].numbers, { calls: 72, rpd: 50 });
  assert.equal(f[0].account, true);
});

test("no token finding without token limits, however big the calls", () => {
  const f = find(chain(8), { outputTokens: 4000 });
  assert.deepEqual(f, []);
  const big = find({ ...chain(3), nodes: chain(3).nodes.map((n) => ({ ...n, agent: "writer" })) }, { outputTokens: 4000, handoffChars: 20000 });
  assert.deepEqual(big, []);
});

test("free models of different tiers share one bucket", () => {
  const d = chain(30);
  d.nodes = d.nodes.map((n, i) => ({ ...n, model: ["fast", "balanced", "strong"][i % 3] }));
  assert.deepEqual(find(d), []);
  const more = chain(60);
  more.nodes = more.nodes.map((n, i) => ({ ...n, model: ["fast", "balanced", "strong"][i % 3] }));
  const f = find(more);
  assert.equal(f[0].kind, "day-requests");
  assert.equal(f[0].numbers.calls, 60);
});

test("a Groq design is counted for each model as before", () => {
  const groq = chain(60, "groq-free");
  groq.nodes = groq.nodes.map((n, i) => ({ ...n, model: i % 2 ? "fast" : "balanced" }));
  assert.ok(!find(groq).some((x) => x.kind === "day-requests"));
  assert.ok(find(chain(1100, "groq-free")).some((x) => x.kind === "day-requests"));
});

test("OpenRouter free and Groq free in one design count in separate buckets", () => {
  const d = chain(40);
  d.nodes = [...d.nodes, ...chain(40, "groq-free").nodes.map((n) => ({ ...n, id: `g${n.id}` }))];
  d.edges = [];
  assert.deepEqual(find(d).filter((x) => x.kind === "day-requests"), []);
  const over = chain(60);
  over.nodes = [...over.nodes, ...chain(5, "groq-free").nodes.map((n) => ({ ...n, id: `g${n.id}` }))];
  const f = find(over).filter((x) => x.kind === "day-requests");
  assert.equal(f.length, 1);
  assert.ok(f[0].agents.every((id) => id.startsWith("n")));
});

test("a run that needs more minutes than allowed at the minute limit is slow, in requests", () => {
  const saved = PROVIDERS.openrouter.freeLimits;
  PROVIDERS.openrouter.freeLimits = { ...saved, rpd: 1000 };
  try {
    const f = find(chain(100));
    const slow = f.find((x) => x.kind === "slow");
    assert.ok(slow, "slow expected");
    assert.deepEqual(slow.numbers, { calls: 100, rpm: 20, minutes: 5 });
    assert.equal(slow.account, true);
  } finally {
    PROVIDERS.openrouter.freeLimits = saved;
  }
});

test("the summary has the requests and no token numbers", () => {
  const s = limitSummary({ design: chain(8), limits: LIMITS });
  assert.equal(s.calls, 8);
  assert.equal(s.rpd, 50);
  assert.equal(s.rpm, 20);
  assert.equal(s.tpm, null);
  assert.equal(s.tpd, null);
  assert.equal(s.minutes, 1);
  assert.equal(limitSummary({ design: chain(30, "groq-free"), limits: LIMITS }).tpm, 8000);
});

const offerIds = (design, loadedSlots) => limitOffers({ design, limits: LIMITS, loadedSlots }).map((o) => o.id);

test("offers for 72 calls: tomorrow, move an agent, a paid key; never shorter answers", () => {
  const d = chain(72);
  const ids = offerIds(d, ["openrouter-free", "groq-free", "groq"]);
  assert.ok(ids.includes("tomorrow"));
  assert.ok(ids.includes("move-agent"));
  assert.ok(ids.includes("paid-key"));
  assert.ok(!ids.includes("shorter"));
  assert.ok(!ids.includes("slowly"));
  const paid = limitOffers({ design: d, limits: LIMITS, loadedSlots: ["openrouter-free"] }).find((o) => o.id === "paid-key");
  assert.equal(paid.disabled, true);
  assert.equal(paid.slot, "openrouter");
  const loaded = limitOffers({ design: d, limits: LIMITS, loadedSlots: ["openrouter-free", "openrouter"] }).find((o) => o.id === "paid-key");
  assert.equal(loaded.disabled, false);
  assert.equal(loaded.after.length, 0);
});

test("the move offer needs another loaded provider and takes the agents with most calls", () => {
  const d = chain(72);
  assert.ok(!offerIds(d, ["openrouter-free"]).includes("move-agent"));
  const move = limitOffers({ design: d, limits: LIMITS, loadedSlots: ["openrouter-free", "anthropic"] }).find((o) => o.id === "move-agent");
  assert.equal(move.slot, "anthropic");
  assert.equal(move.after.length, 0);
  const moved = move.apply(d, {}).design;
  assert.ok(moved.nodes.filter((n) => n.slot === "anthropic").length >= 22);
});

test("fewer rounds are offered for a debate", () => {
  const d = { pattern: "debate", rounds: 30, nodes: [{ id: "a", agent: "debater", model: "fast", search: false, slot: "openrouter-free" }, { id: "b", agent: "debater", model: "fast", search: false, slot: "openrouter-free" }, { id: "j", agent: "judge", model: "fast", search: false, slot: "openrouter-free" }], edges: [] };
  assert.ok(offerIds(d, ["openrouter-free"]).includes("fewer"));
});

test("the offers of the mockup come in its order", () => {
  const d = { pattern: "debate", rounds: 30, nodes: [{ id: "a", agent: "debater", model: "fast", search: false, slot: "openrouter-free" }, { id: "b", agent: "debater", model: "fast", search: false, slot: "openrouter-free" }, { id: "j", agent: "judge", model: "fast", search: false, slot: "openrouter-free" }], edges: [] };
  assert.deepEqual(offerIds(d, ["openrouter-free", "groq-free", "groq"]).filter((id) => id !== "lightest-only"), ["fewer", "tomorrow", "move-agent", "paid-key"]);
});

// The view
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  append(...nodes) { this.children.push(...nodes); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(""); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const tOf = (dict) => (key, params = {}) => String(dict[key] ?? `MISSING ${key}`).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
const view = (dict, findings, summary) => limitsView({ doc, t: tOf(dict), findings, offers: [], summary, providerName: "OpenRouter", nameOf: (id) => id, slotName: (id) => id, num: (n) => String(n), onApply() {} });

test("the view writes the requests variants in both languages", () => {
  const s = limitSummary({ design: chain(8), limits: LIMITS });
  for (const dict of [en, cs]) {
    const fits = view(dict, [], s).text;
    assert.doesNotMatch(fits, /MISSING|\{\w+\}/);
    assert.match(fits, /\b8\b/);
    assert.doesNotMatch(fits, /tokens|tokenů/);
    const day = view(dict, [{ kind: "day-requests", agents: ["n0"], account: true, numbers: { calls: 72, rpd: 50 } }], limitSummary({ design: chain(72), limits: LIMITS }));
    assert.doesNotMatch(day.text, /MISSING|\{\w+\}/);
    assert.match(day.text, /72/);
    assert.ok(day.find((e) => e.attrs["data-ui"] === "limits-bar").length === 1);
    const slow = view(dict, [{ kind: "slow", agents: ["n0"], account: true, numbers: { calls: 100, rpm: 20, minutes: 5 } }], s);
    assert.doesNotMatch(slow.text, /MISSING|\{\w+\}/);
  }
  assert.notEqual(en["limits.fits.bodyRequests"], cs["limits.fits.bodyRequests"]);
  assert.notEqual(en["limits.slowRequests.body"], cs["limits.slowRequests.body"]);
});

test("the Groq texts are the ones used before", () => {
  const s = limitSummary({ design: chain(8, "groq-free"), limits: LIMITS });
  assert.match(view(en, [], s).text, /biggest call/);
  const day = view(en, [{ kind: "day-requests", agents: ["n0"], numbers: { calls: 1100, rpd: 1000 } }], s);
  assert.match(day.text, /for each model/);
});
