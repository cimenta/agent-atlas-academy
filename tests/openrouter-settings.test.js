import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { limitsBox, modelsBox, modelRows } from "../public/js/settings-limits-box.js";
import { PROVIDERS } from "../public/js/engine/providers.js";
import { createFreeCheck, sharedFreeCheck } from "../public/js/engine/free-check.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn) { this.listeners[type] = fn; }
  append(...nodes) { this.children.push(...nodes); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(" "); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const tOf = (dict) => (key, params = {}) => String(dict[key] ?? `MISSING ${key}`).replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
const num = (n) => String(n);
const rows = (box) => box.find((e) => e.tag === "tr").map((r) => r.text.replace(/\s+/g, " ").trim());
const or = PROVIDERS.openrouter;

test("the OpenRouter limits box has the two request rows only, with the account note and the credits note", () => {
  for (const dict of [en, cs]) {
    const box = limitsBox({ doc, t: tOf(dict), limits: or.freeLimits, num, providerName: "OpenRouter", dataKey: or.text.limitsData });
    assert.equal(box.attrs["data-ui"], "free-limits");
    const r = rows(box);
    assert.equal(r.length, 3, "header and two rows");
    assert.match(r[1], /\b20\b/);
    assert.match(r[2], /\b50\b/);
    assert.match(r[2], /1000/);
    assert.match(box.text, /OpenRouter/);
    assert.doesNotMatch(box.text, /MISSING|\{\w+\}/);
    assert.doesNotMatch(r.join(" "), /token|Token/);
  }
  assert.match(tOf(en)("settings.freeLimitsHintRequests"), /no limit on tokens/);
});

test("the data notice of OpenRouter names the training of free models", () => {
  const box = limitsBox({ doc, t: tOf(en), limits: or.freeLimits, num, providerName: "OpenRouter", dataKey: or.text.limitsData });
  assert.match(box.text, /free models are served by other companies/);
  assert.doesNotMatch(box.text, /United States/);
});

test("the Groq box is as before: four rows, the generic account note", () => {
  const box = limitsBox({ doc, t: tOf(en), limits: PROVIDERS.groq.freeLimits, num });
  assert.equal(rows(box).length, 5);
  assert.match(box.text, /for each model and for your whole account/);
  assert.match(box.text, /United States/);
});

test("the free slot lists the free ids with the forced-format column", () => {
  const box = modelsBox({ doc, t: tOf(en), provider: or, slot: "openrouter-free" });
  const r = rows(box);
  assert.match(r[0], /Forced reply format/);
  assert.match(r[1], /Fast .*google\/gemma-4-26b-a4b-it:free .*yes/);
  assert.match(r[2], /Balanced .*google\/gemma-4-31b-it:free .*yes/);
  assert.match(r[3], /Strong .*nvidia\/nemotron-3-ultra-550b-a55b:free .*no, the app repairs the format if needed/);
  assert.match(box.text, /Free models come and go/);
  assert.match(box.text, /Web search is not available on OpenRouter/);
});

test("the paid slot lists the paid ids with the prices", () => {
  const box = modelsBox({ doc, t: tOf(en), provider: or, slot: "openrouter" });
  const r = rows(box);
  assert.match(r[0], /USD per million tokens/);
  assert.match(r[1], /deepseek\/deepseek-v4-flash .*0\.09, 0\.18/);
  assert.match(r[2], /anthropic\/claude-haiku-5\.5 .*0\.10, 0\.50/);
  assert.match(r[3], /anthropic\/claude-sonnet-5\.5 .*2\.00, 10\.00/);
  assert.doesNotMatch(box.text, /Forced reply format|Free models come and go/);
  // in Czech the prices use the Czech decimal comma
  const czech = modelsBox({ doc, t: tOf(cs), provider: or, slot: "openrouter", locale: "cs-CZ" });
  assert.match(rows(czech)[1], /0,09; 0,18/);
});

test("Groq and Anthropic tables have no extra column", () => {
  const groq = modelsBox({ doc, t: tOf(en), provider: PROVIDERS.groq, slot: "groq-free" });
  assert.equal(rows(groq)[0].split(/\s{1}/).length > 0, true);
  assert.doesNotMatch(groq.text, /Forced reply format|USD per million/);
  assert.deepEqual(modelRows(PROVIDERS.groq, "groq-free").map((r) => r.keys), [["fast"], ["balanced", "strong"]]);
  assert.match(groq.text, /Balanced and Strong/);
});

test("a model the student chose for a tier is shown with a button to go back to the registry one", () => {
  const reset = [];
  const box = modelsBox({ doc, t: tOf(en), provider: or, slot: "openrouter-free", overrides: { strong: "a/b:free" }, onReset: (key) => reset.push(key) });
  assert.match(rows(box)[3], /a\/b:free .*chosen by you/);
  assert.doesNotMatch(rows(box)[3], /nemotron/);
  const button = box.find((e) => e.tag === "button");
  assert.equal(button.length, 1);
  button[0].listeners.click();
  assert.deepEqual(reset, ["strong"]);
  assert.equal(modelsBox({ doc, t: tOf(en), provider: or, slot: "openrouter-free" }).find((e) => e.tag === "button").length, 0);
});

test("the new texts exist in both languages, Czech differs, parameters match", () => {
  const keys = [...Object.values(or.text).filter((k) => /^settings\./.test(k)), "settings.freeLimitsHintRequests", "settings.freeLimitsAccountAll", "settings.freeLimits.rpdMeaningCredits", "settings.modelsForced", "settings.modelsForcedYes", "settings.modelsForcedNo", "settings.modelsPrices", "settings.modelsComeAndGo", "settings.modelsChosen", "settings.modelsReset", "settings.checkModelsHintFree"];
  const names = (s) => (String(s).match(/\{(\w+)\}/g) ?? []).sort().join();
  for (const k of keys) {
    assert.equal(typeof en[k], "string", `en ${k}`);
    assert.equal(typeof cs[k], "string", `cs ${k}`);
    assert.notEqual(en[k], cs[k], `cs differs ${k}`);
    assert.equal(names(en[k]), names(cs[k]), `params ${k}`);
  }
});

test("Check models of the free slot works without a key and feeds the shared check", async () => {
  const page = readFileSync(new URL("../public/js/settings-page.js", import.meta.url), "utf8");
  assert.match(page, /keyless/);
  assert.match(page, /sharedFreeCheck/);
  assert.equal(typeof sharedFreeCheck.run, "function");
  let calls = 0;
  const check = createFreeCheck({ fetchFn: async () => { calls += 1; return { ok: true, status: 200, json: async () => ({ ok: true, total: 5, ids: ["a"], catalogFound: [], freeIds: ["a/b:free"], freeModels: [{ id: "a/b:free", name: "A", tools: true, forcedFormat: true }] }) }; }, now: () => 1 });
  const first = await check.run({ force: true });
  assert.equal(first.data.total, 5);
  assert.deepEqual(first.data.catalogFound, []);
  await check.run();
  assert.equal(calls, 1);
  const failing = createFreeCheck({ fetchFn: async () => ({ ok: false, status: 429, json: async () => ({ error: "rate_limit" }) }) });
  assert.equal((await failing.run()).error, "rate_limit");
  assert.equal((await createFreeCheck({ fetchFn: async () => { throw new Error("x"); } }).run()).error, "unreachable");
});

test("a backup carries both OpenRouter key slots and puts them back", async () => {
  const { createVault } = await import("../public/js/storage/key-vault.js");
  const { createSettingsStore } = await import("../public/js/storage/settings.js");
  const { exportBackup, parseBackup, applyBackup, backupVaultRecords } = await import("../public/js/storage/backup.js");
  const { createMemoryBackend, createRunStore } = await import("../public/js/storage/runs-store.js");
  const memory = () => { const map = new Map(); return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => map.delete(k) }; };
  const FREE_KEY = `sk-or-v1-FREE${"a".repeat(40)}`;
  const PAID_KEY = `sk-or-v1-PAID${"b".repeat(40)}`;
  const vault = createVault({ storage: memory(), iterations: 1000 });
  await vault.forProvider("openrouter-free").remember(FREE_KEY, "correct horse battery");
  await vault.forProvider("openrouter").remember(PAID_KEY, "correct horse battery");
  const backup = exportBackup({ runs: [], settings: {}, ...backupVaultRecords((id) => vault.forProvider(id)), includeKey: true, appVersion: "t" });
  assert.ok(backup.vaultSlots["openrouter-free"] && backup.vaultSlots.openrouter);
  assert.ok(!JSON.stringify(backup).includes(FREE_KEY) && !JSON.stringify(backup).includes(PAID_KEY));
  const target = createVault({ storage: memory(), iterations: 1000 });
  await applyBackup(parseBackup(JSON.stringify(backup)).backup, { runStore: createRunStore(createMemoryBackend()), settingsStore: createSettingsStore(memory()), vault: target, mode: "merge" });
  assert.equal(await target.forProvider("openrouter-free").unlock("correct horse battery"), FREE_KEY);
  assert.equal(await target.forProvider("openrouter").unlock("correct horse battery"), PAID_KEY);
});
