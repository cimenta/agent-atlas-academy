import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { limitsView } from "../public/js/create/limits-view.js";
import { limitSummary } from "../public/js/engine/limits.js";

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn) { (this.listeners ??= {})[type] = fn; }
  append(...nodes) { this.children.push(...nodes); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(""); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const t = (key, params = {}) => (Object.keys(params).length ? `${key} ${JSON.stringify(params)}` : key);
const base = { doc, t, providerName: "Groq", nameOf: (id) => id.toUpperCase(), slotName: (id) => id, num: (n) => String(n) };
const summary = { perCall: 3200, total: 21000, calls: 6, tpm: 8000, tpd: 200000, rpd: 1000, minutes: 3 };
const ui = (view, name) => view.find((e) => e.attrs["data-ui"] === name);

test("no agent on a free slot draws nothing", () => {
  assert.equal(limitsView({ ...base, findings: [], offers: [], summary: null, onApply() {} }), null);
});

test("no findings draws the fits block with the numbers", () => {
  const v = limitsView({ ...base, findings: [], offers: [], summary, onApply() {} });
  assert.equal(ui(v, "limits-fits").length, 1);
  assert.match(v.text, /limits\.fits\.body/);
  assert.match(v.text, /"perCall":"3200"/);
});

test("each kind of finding draws its own block, the blocking one as an error", () => {
  const kinds = { "call-too-big": { agents: ["w"], numbers: { perCall: 11000, tpm: 8000 } }, slow: { agents: ["a"], numbers: { total: 38000, tpm: 8000, minutes: 5 } }, "day-tokens": { agents: ["a"], numbers: { total: 240000, tpd: 200000 } }, "day-requests": { agents: ["a"], numbers: { calls: 1200, rpd: 1000 } } };
  for (const [kind, f] of Object.entries(kinds)) {
    const v = limitsView({ ...base, findings: [{ kind, ...f }], offers: [], summary, onApply() {} });
    const block = ui(v, `limits-${kind}`);
    assert.equal(block.length, 1, kind);
    assert.match(block[0].text, new RegExp(`limits\.${kind}\.title`));
    assert.match(block[0].attrs.class, kind === "call-too-big" ? /err/ : /warn/);
  }
});

test("an offer is a button that hands itself to onApply; a disabled one has no handler", () => {
  const applied = [];
  const offers = [{ id: "shorter", values: { outputTokens: 1500, handoffChars: 4000 }, apply() {}, after: [] }, { id: "paid-key", disabled: true, apply() {}, after: [] }];
  const v = limitsView({ ...base, findings: [{ kind: "slow", agents: ["a"], numbers: { total: 38000, tpm: 8000, minutes: 5 } }], offers, summary, onApply: (o) => applied.push(o.id) });
  const shorter = ui(v, "offer-shorter")[0];
  shorter.listeners.click();
  assert.deepEqual(applied, ["shorter"]);
  const paid = ui(v, "offer-paid-key")[0];
  assert.notEqual(paid.attrs.disabled, undefined);
  assert.equal(paid.listeners, undefined);
});

test("a chosen keep-as-is offer shows as chosen instead of a button", () => {
  const offers = [{ id: "slowly", apply() {}, after: [] }];
  const v = limitsView({ ...base, findings: [{ kind: "slow", agents: ["a"], numbers: { total: 38000, tpm: 8000, minutes: 5 } }], offers, summary, chosen: "slowly", onApply() {} });
  assert.equal(ui(v, "offer-slowly").length, 0);
  assert.equal(ui(v, "offer-chosen").length, 1);
});

test("limitSummary: null without free agents, numbers with them", () => {
  const design = { pattern: "sequential", nodes: [{ id: "a", agent: "writer", model: "fast", search: false, slot: "anthropic" }], edges: [] };
  assert.equal(limitSummary({ design, limits: {} }), null);
  const free = { ...design, nodes: [{ ...design.nodes[0], slot: "groq-free" }] };
  const s = limitSummary({ design: free, limits: {} });
  assert.equal(s.tpm, 8000);
  assert.equal(s.perCall, 300 + 250 + 4000);
});

test("every text of the limits box exists in both languages and Czech differs", () => {
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  const keys = Object.keys(en).filter((k) => k.startsWith("limits."));
  assert.ok(keys.length >= 24, `only ${keys.length} limits.* keys`);
  for (const k of keys) {
    assert.equal(typeof cs[k], "string", `cs ${k}`);
    assert.notEqual(cs[k], en[k], `${k} same`);
    assert.deepEqual([...en[k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), [...cs[k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), `${k} params`);
  }
});

test("a design with search on a Groq agent gets no search tool", async () => {
  const { toolsFor } = await import("../public/js/engine/tools.js");
  const budget = { remainingSearches: () => 3 };
  assert.equal(toolsFor({ search: true, slot: "groq-free" }, budget).length, 0);
  assert.equal(toolsFor({ search: true, slot: "anthropic" }, budget).length, 1);
  assert.equal(toolsFor({ search: true }, budget, "groq").length, 0);
  assert.equal(toolsFor({ search: true }, budget, "anthropic").length, 1);
});
