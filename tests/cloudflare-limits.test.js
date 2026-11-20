import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { callsOf, neuronsOf } from "../public/js/engine/estimate.js";
import { limitFindings, limitOffers, limitSummary } from "../public/js/engine/limits.js";
import { limitsView } from "../public/js/create/limits-view.js";

const LIMITS = { maxSteps: 90, maxTokens: 400000, maxSearches: 3 };
const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
const chain = (n, slot = "cloudflare-free", model = "balanced", agent = "writer") => ({
  pattern: "sequential",
  nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}`, agent, model, search: false, slot })),
  edges: Array.from({ length: n - 1 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` })),
});
const one = (model, slot = "cloudflare-free") => chain(1, slot, model);
const neurons = (design) => { const rows = callsOf(design, LIMITS, {}); return design.nodes.reduce((sum, n, i) => sum + neuronsOf(n, rows[i]), 0); };

test("a run of one agent on each tier gives the neurons of the rate table", () => {
  const rows = callsOf(one("fast"), LIMITS, {});
  assert.equal(rows[0].inputTokens, 550);
  assert.equal(rows[0].outputTokens, 1500);
  assert.equal(rows[0].inputTokens + rows[0].outputTokens, rows[0].typicalTokens);
  assert.ok(Math.abs(neurons(one("fast")) - 45.90955) < 1e-6);
  assert.ok(Math.abs(neurons(one("balanced")) - 119.7729) < 1e-6);
  assert.ok(Math.abs(neurons(one("strong")) - 458.86345) < 1e-6);
});

test("an agent that is not on a Cloudflare model counts no neurons", () => {
  for (const slot of ["groq-free", "anthropic", "openrouter-free", "google-free"]) assert.equal(neurons(one("fast", slot)), 0, slot);
});

test("a design that is under the pool has no finding and a summary with neurons and the pool", () => {
  const d = chain(3);
  assert.deepEqual(limitFindings({ design: d, limits: LIMITS }), []);
  const s = limitSummary({ design: d, limits: LIMITS });
  assert.equal(s.pool, 10000);
  assert.equal(Math.round(s.neurons), Math.round(neurons(d)));
  assert.equal(limitSummary({ design: chain(2, "anthropic"), limits: LIMITS }), null);
});

test("over the pool: one day-neurons finding for the account, and no requests or token finding from the null numbers", () => {
  const d = chain(80);
  const f = limitFindings({ design: d, limits: LIMITS });
  assert.deepEqual(f.map((x) => x.kind), ["day-neurons"]);
  assert.equal(f[0].account, true);
  assert.equal(f[0].numbers.pool, 10000);
  assert.equal(f[0].numbers.neurons, Math.ceil(neurons(d)));
  assert.ok(f[0].numbers.neurons > 10000);
  assert.equal(f[0].agents.length, 80);
});

test("an agent on the paid slot adds nothing to the pool, and the tiers share one pool", () => {
  const d = chain(80);
  d.nodes = d.nodes.map((n, i) => (i < 79 ? { ...n, slot: "cloudflare" } : n));
  assert.deepEqual(limitFindings({ design: d, limits: LIMITS }), []);
  const mixedTiers = chain(80);
  mixedTiers.nodes = mixedTiers.nodes.map((n, i) => ({ ...n, model: ["fast", "balanced", "strong"][i % 3] }));
  const f = limitFindings({ design: mixedTiers, limits: LIMITS });
  assert.equal(f[0].kind, "day-neurons");
  assert.equal(f[0].agents.length, 80);
});

test("mixed with Groq free agents: the finding names the Cloudflare agents only, and the paid key moves only them", () => {
  const d = chain(80);
  d.nodes.unshift({ id: "g", agent: "writer", model: "fast", search: false, slot: "groq-free" });
  d.edges.unshift({ from: "g", to: "n0" });
  const f = limitFindings({ design: d, limits: LIMITS }).find((x) => x.kind === "day-neurons");
  assert.ok(f && !f.agents.includes("g"));
  const offers = limitOffers({ design: d, limits: LIMITS, loadedSlots: ["groq-free", "groq", "cloudflare-free", "cloudflare"] });
  const paid = offers.find((o) => o.id === "paid-key");
  assert.equal(paid.slot, "cloudflare");
  assert.ok(!paid.agents.includes("g"));
});

test("offers come in the order of the design and each recomputes what is left", () => {
  const d = { ...chain(81, "cloudflare-free", "balanced", "voter"), pattern: "voting" };
  const offers = limitOffers({ design: d, limits: LIMITS, loadedSlots: ["groq-free", "cloudflare-free"] });
  const ids = offers.map((o) => o.id);
  const order = ["fewer", "shorter", "lightest-model", "tomorrow", "move-agent", "paid-key"];
  assert.deepEqual(ids.filter((id) => order.includes(id)), order.filter((id) => ids.includes(id)));
  for (const id of ["shorter", "lightest-model", "tomorrow", "paid-key"]) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes("slowly"), "running slowly does not help a daily pool");
  const lightest = offers.find((o) => o.id === "lightest-model");
  const applied = lightest.apply(d, { outputTokens: 4000, handoffChars: 0 });
  assert.ok(applied.design.nodes.every((n) => n.model === "fast"));
  assert.ok(lightest.after.length <= 1);
  const allFast = chain(81, "cloudflare-free", "fast");
  assert.ok(!limitOffers({ design: allFast, limits: LIMITS, loadedSlots: [] }).some((o) => o.id === "lightest-model"));
  const shorter = offers.find((o) => o.id === "shorter");
  assert.ok(shorter.after.length === 0 || shorter.after[0].numbers.neurons < limitFindings({ design: d, limits: LIMITS })[0].numbers.neurons);
});

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  append(...nodes) { this.children.push(...nodes); }
  get text() { return this.children.map((c) => c.text).join(" "); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const tOf = (dict) => (key, params = {}) => String(dict[key] ?? `MISSING ${key}`).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
const view = (dict, locale, design) => {
  const findings = limitFindings({ design, limits: LIMITS });
  return limitsView({ doc, t: tOf(dict), findings, offers: limitOffers({ design, limits: LIMITS, loadedSlots: [] }), summary: limitSummary({ design, limits: LIMITS }), providerName: "Cloudflare", nameOf: (id) => id, slotName: (s) => s, num: (n) => new Intl.NumberFormat(locale).format(n), onApply() {} });
};

test("the view says about N of the 10,000 neurons, in both languages, with the bar and the fits line", () => {
  const over = view(en, "en-US", chain(80));
  assert.match(over.text, /may not finish today on a free Cloudflare account/);
  assert.match(over.text, /10,000/);
  assert.match(over.text, /Day: [\d,]+ of 10,000 neurons/);
  const czech = view(cs, "cs-CZ", chain(80));
  assert.match(czech.text, /10\s000/);
  assert.doesNotMatch(over.text + czech.text, /MISSING|\{\w+\}/);
  const fits = view(en, "en-US", chain(3));
  assert.match(fits.text, /Fits the free pool of Cloudflare/);
  assert.match(fits.text, /of your 10,000 neurons today \(\d+%\)/);
  assert.match(fits.text, /Day: [\d,]+ of 10,000 neurons/);
  const fitsCs = view(cs, "cs-CZ", chain(3));
  assert.match(fitsCs.text, /Vejde se do bezplatné zásoby Cloudflare/);
  assert.match(fitsCs.text, /\d+\s%/);
});

test("the new texts exist in en and cs, Czech differs, parameters match", () => {
  const keys = ["limits.fits.title.neurons", "limits.fits.bodyNeurons", "limits.day-neurons.title", "limits.day-neurons.body", "limits.dayBarNeurons", "limits.offer.lightest-model.title", "limits.offer.lightest-model.body"];
  const names = (s) => (String(s).match(/\{(\w+)\}/g) ?? []).sort().join();
  for (const k of keys) {
    assert.equal(typeof en[k], "string", `en ${k}`);
    assert.equal(typeof cs[k], "string", `cs ${k}`);
    assert.notEqual(en[k], cs[k], `cs differs ${k}`);
    assert.equal(names(en[k]), names(cs[k]), `params ${k}`);
  }
});
