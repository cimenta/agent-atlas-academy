import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { limitsBox, modelsBox, modelRows } from "../public/js/settings-limits-box.js";
import { PROVIDERS } from "../public/js/engine/providers.js";

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  append(...nodes) { this.children.push(...nodes); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(" "); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const t = (key, params = {}) => (Object.keys(params).length ? `${key} ${JSON.stringify(params)}` : key);
const num = (n) => `#${n}`;
const free = PROVIDERS.groq.freeLimits;

test("the free limits box shows the four limits, the account note and the data notice", () => {
  const box = limitsBox({ doc, t, limits: free, num });
  assert.equal(box.attrs["data-ui"], "free-limits");
  for (const n of [free.rpm, free.tpm, free.rpd, free.tpd]) assert.ok(box.text.includes(`#${n}`), String(n));
  assert.match(box.text, /settings\.freeLimitsAccount/);
  assert.match(box.text, /settings\.freeLimitsData/);
  assert.equal(box.find((e) => e.tag === "tr").length, 5);
});

test("Balanced and Strong share one Groq model and say so", () => {
  const rows = modelRows(PROVIDERS.groq);
  assert.deepEqual(rows.map((r) => r.keys), [["fast"], ["balanced", "strong"]]);
  const box = modelsBox({ doc, t, provider: PROVIDERS.groq });
  assert.equal(box.attrs["data-ui"], "models-note");
  assert.match(box.text, /settings\.modelsShared/);
  assert.match(box.text, /openai\/gpt-oss-120b/);
});

test("a provider whose three models differ has no shared note", () => {
  assert.equal(modelRows(PROVIDERS.anthropic).every((r) => r.keys.length === 1), true);
  assert.doesNotMatch(modelsBox({ doc, t, provider: PROVIDERS.anthropic }).text, /settings\.modelsSharedNote/);
});

test("the texts exist in both languages, Czech differs, parameters match", () => {
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  const keys = Object.keys(en).filter((k) => /^settings\.(freeLimits|models)/.test(k));
  assert.ok(keys.length >= 14, `only ${keys.length} keys`);
  for (const k of keys) {
    assert.equal(typeof cs[k], "string", `cs ${k}`);
    assert.notEqual(cs[k], en[k], `${k} same`);
    assert.deepEqual([...en[k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), [...cs[k].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), `${k} params`);
  }
});
