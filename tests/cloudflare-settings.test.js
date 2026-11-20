import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { limitsBox, modelsBox } from "../public/js/settings-limits-box.js";
import { PROVIDERS } from "../public/js/engine/providers.js";

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
const rows = (box) => box.find((e) => e.tag === "tr").map((r) => r.text.replace(/\s+/g, " ").trim());
const cf = PROVIDERS.cloudflare;
const num = (locale) => (n) => n.toLocaleString(locale);

test("the Cloudflare limits box has one row, 10,000, with the reset note and the data notice that training is not stated", () => {
  for (const [dict, locale] of [[en, "en-US"], [cs, "cs-CZ"]]) {
    const box = limitsBox({ doc, t: tOf(dict), limits: cf.freeLimits, num: num(locale), providerName: "Cloudflare", dataKey: cf.text.limitsData });
    assert.equal(box.attrs["data-ui"], "free-limits");
    const r = rows(box);
    assert.equal(r.length, 2, "header and one row");
    assert.match(r[1].replace(/\s/g, ""), /10[ ,.]?000|10000/);
    assert.match(box.text, /Cloudflare/);
    assert.match(box.text, /00:00 UTC/);
    assert.doesNotMatch(box.text, /MISSING|\{\w+\}/);
  }
  const box = limitsBox({ doc, t: tOf(en), limits: cf.freeLimits, num: num("en-US"), providerName: "Cloudflare", dataKey: cf.text.limitsData });
  assert.match(box.text, /what the limit is/);
  assert.match(box.text, /do not say whether prompts are used for training/);
  assert.match(box.text, /in neurons, not in tokens or requests/);
  assert.doesNotMatch(box.text, /United States/);
  // Groq and OpenRouter keep their own wording
  assert.match(limitsBox({ doc, t: tOf(en), limits: PROVIDERS.groq.freeLimits, num: num("en-US") }).text, /what the limits are/);
});

test("the free models table shows the neuron rates and the typical run of the mockup", () => {
  const box = modelsBox({ doc, t: tOf(en), provider: cf, slot: "cloudflare-free", locale: "en-US" });
  const r = rows(box);
  assert.match(r[0], /Neurons per million tokens \(in, out\)/);
  assert.match(r[0], /A typical run \(30,000 in, 10,000 out\)/);
  assert.match(r[1], /Fast .*@cf\/google\/gemma-4-26b-a4b-it .*9,091, 27,273 .*about 550 neurons, 18 runs a day/);
  assert.match(r[2], /Balanced .*@cf\/openai\/gpt-oss-120b .*31,818, 68,182 .*about 1,640 neurons, 6 runs a day/);
  assert.match(r[3], /Strong .*@cf\/qwen\/qwen3\.8-27b .*40,909, 290,909 .*about 4,140 neurons, 2 runs a day/);
  assert.match(box.text, /Models used on Cloudflare free/);
  assert.match(box.text, /Web search is not available on Cloudflare/);
  assert.match(box.text, /Check models marks a model that Cloudflare no longer offers/);
  const czech = modelsBox({ doc, t: tOf(cs), provider: cf, slot: "cloudflare-free", locale: "cs-CZ" });
  assert.match(rows(czech)[2].replace(/\s/g, " "), /31 818; 68 182/);
  assert.match(rows(czech)[2].replace(/\s/g, " "), /asi 1 640 neuronů, 6 běhů denně/);
  assert.doesNotMatch(czech.text, /MISSING|\{\w+\}/);
});

test("the paid models table shows the dollar prices with the Czech decimal comma", () => {
  const box = modelsBox({ doc, t: tOf(en), provider: cf, slot: "cloudflare" });
  const r = rows(box);
  assert.match(r[0], /USD per million tokens/);
  assert.match(r[1], /gemma-4-26b-a4b-it .*0\.10, 0\.30/);
  assert.match(r[2], /gpt-oss-120b .*0\.35, 0\.75/);
  assert.match(r[3], /qwen3\.8-27b .*0\.45, 3\.20/);
  assert.doesNotMatch(box.text, /Neurons per million/);
  assert.match(box.text, /Models used on Cloudflare paid/);
  const czech = modelsBox({ doc, t: tOf(cs), provider: cf, slot: "cloudflare", locale: "cs-CZ" });
  assert.match(rows(czech)[3], /0,45; 3,20/);
});

test("the Groq and OpenRouter tables are unchanged by the neuron columns", () => {
  const groq = modelsBox({ doc, t: tOf(en), provider: PROVIDERS.groq, slot: "groq-free" });
  assert.doesNotMatch(groq.text, /Neurons per million|typical run/);
  const orf = modelsBox({ doc, t: tOf(en), provider: PROVIDERS.openrouter, slot: "openrouter-free" });
  assert.match(rows(orf)[0], /Forced reply format/);
  assert.doesNotMatch(orf.text, /Neurons per million/);
});

test("the key field of the Cloudflare tab says ACCOUNT_ID:TOKEN and a key of the wrong shape is refused with the format named", () => {
  const page = readFileSync(new URL("../public/js/settings-page.js", import.meta.url), "utf8");
  assert.match(page, /keyPattern/);
  assert.match(page, /keyPlaceholder/);
  assert.equal(cf.keyPlaceholder, "ACCOUNT_ID:TOKEN");
  assert.match(en[cf.text.keyFormat], /ACCOUNT_ID:TOKEN/);
  assert.match(cs[cf.text.keyFormat], /ACCOUNT_ID:TOKEN/);
  assert.match(en[cf.text.keyLabel], /ACCOUNT_ID:TOKEN/);
});

test("the new texts exist in en and cs, Czech differs, parameters match", () => {
  const keys = [...Object.values(cf.text).filter((k) => /^settings\./.test(k)), "settings.freeLimitsTitleSingle", "settings.freeLimitsAccountPool", "settings.freeLimits.neurons", "settings.freeLimits.neuronsMeaning", "settings.freeLimitsHintPool", "settings.modelsNeurons", "settings.modelsTypical", "settings.modelsTypicalRun", "settings.modelsCloudflareNote"];
  const names = (s) => (String(s).match(/\{(\w+)\}/g) ?? []).sort().join();
  for (const k of keys) {
    assert.equal(typeof en[k], "string", `en ${k}`);
    assert.equal(typeof cs[k], "string", `cs ${k}`);
    assert.notEqual(en[k], cs[k], `cs differs ${k}`);
    assert.equal(names(en[k]), names(cs[k]), `params ${k}`);
  }
});

test("a backup carries both Cloudflare key slots and puts them back; a backup from before this release restores", async () => {
  const { createVault } = await import("../public/js/storage/key-vault.js");
  const { createSettingsStore } = await import("../public/js/storage/settings.js");
  const { exportBackup, parseBackup, applyBackup, backupVaultRecords } = await import("../public/js/storage/backup.js");
  const { createMemoryBackend, createRunStore } = await import("../public/js/storage/runs-store.js");
  const memory = () => { const map = new Map(); return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => map.delete(k) }; };
  const FREE_KEY = `${"a".repeat(32)}:${"F".repeat(40)}`;
  const PAID_KEY = `${"b".repeat(32)}:${"P".repeat(40)}`;
  const vault = createVault({ storage: memory(), iterations: 1000 });
  await vault.forProvider("cloudflare-free").remember(FREE_KEY, "correct horse battery");
  await vault.forProvider("cloudflare").remember(PAID_KEY, "correct horse battery");
  const backup = exportBackup({ runs: [], settings: {}, ...backupVaultRecords((id) => vault.forProvider(id)), includeKey: true, appVersion: "t" });
  assert.ok(backup.vaultSlots["cloudflare-free"] && backup.vaultSlots.cloudflare);
  assert.ok(!JSON.stringify(backup).includes(FREE_KEY) && !JSON.stringify(backup).includes(PAID_KEY));
  const target = createVault({ storage: memory(), iterations: 1000 });
  await applyBackup(parseBackup(JSON.stringify(backup)).backup, { runStore: createRunStore(createMemoryBackend()), settingsStore: createSettingsStore(memory()), vault: target, mode: "merge" });
  assert.equal(await target.forProvider("cloudflare-free").unlock("correct horse battery"), FREE_KEY);
  assert.equal(await target.forProvider("cloudflare").unlock("correct horse battery"), PAID_KEY);
  const old = exportBackup({ runs: [], settings: {}, vault: null, vaultSlots: {}, includeKey: false, appVersion: "t" });
  const restored = await applyBackup(parseBackup(JSON.stringify(old)).backup, { runStore: createRunStore(createMemoryBackend()), settingsStore: createSettingsStore(memory()), vault: createVault({ storage: memory(), iterations: 1000 }), mode: "merge" });
  assert.ok(restored !== null);
});
