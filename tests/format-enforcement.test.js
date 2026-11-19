import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { createRunHandler } from "../lib/run-handler.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { findSection } from "../public/js/help-topics.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));
const FMT = { fields: [{ name: "title", type: "text" }] };
const GOOD = '{"title":"A"}';
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
function scripted(replies) {
  const calls = [];
  return { calls, call: async (body) => (calls.push(structuredClone(body)), text(replies.shift())) };
}
const run = (design, call, extra = {}) => runDesign({ design, task: "T", limits: LIMIT_DEFAULTS, call, emit: () => {}, ...extra });
const supervisorDesign = () => ({ pattern: "supervisor", nodes: [node("supervisor", "supervisor"), node("writer", "writer")], edges: [{ from: "supervisor", to: "writer" }] });
const sequential = (extra = {}) => ({ pattern: "sequential", nodes: [node("writer", "writer", extra)], edges: [] });

test("a control agent asks for the schema of its reply, and not when enforcement is off", async () => {
  const a = scripted(['{"action":"finish","answer":"x"}']);
  await run(supervisorDesign(), a.call);
  assert.deepEqual(a.calls[0].replySchema.required, ["action"]);
  const b = scripted(['{"action":"finish","answer":"x"}']);
  await run(supervisorDesign(), b.call, { formatEnforcement: false });
  assert.equal("replySchema" in b.calls[0], false);
});

test("an agent with a format asks for its schema; one without a format does not", async () => {
  const a = scripted([GOOD]);
  await run(sequential({ format: FMT }), a.call);
  assert.deepEqual(a.calls[0].replySchema.required, ["title"]);
  const b = scripted(["plain"]);
  await run(sequential(), b.call);
  assert.equal("replySchema" in b.calls[0], false);
});

test("an agent that searches the web is not forced, but is still asked in the prompt and checked", async () => {
  const a = scripted([GOOD]);
  const result = await run(sequential({ format: FMT, search: true }), a.call);
  assert.equal(a.calls[0].tools.length > 0, true);
  assert.equal("replySchema" in a.calls[0], false);
  assert.ok(a.calls[0].system.includes('"title": text'));
  assert.equal(result.finalText, GOOD);
});

test("a self-critique judge asks for the verdict schema", async () => {
  const a = scripted(["draft", '{"verdict":"accept"}']);
  const design = { pattern: "evaluator", nodes: [node("writer", "writer")], edges: [], rounds: 3, criteria: "x", selfCritique: true };
  await run(design, a.call);
  assert.equal("replySchema" in a.calls[0], false);
  assert.deepEqual(a.calls[1].replySchema.properties.verdict.enum, ["accept", "revise"]);
});

test("the setting is on by default and for old data, and is kept", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const store = createSettingsStore(storage);
  assert.equal(store.get().formatEnforcement, true);
  mem.set("aa.settings", JSON.stringify({ fallback: "off" }));
  assert.equal(store.get().formatEnforcement, true);
  store.setFormatEnforcement(false);
  assert.equal(createSettingsStore(storage).get().formatEnforcement, false);
  store.setFormatEnforcement(true);
  assert.equal(store.get().formatEnforcement, true);
});

test("the server passes the switch on to the run", async () => {
  const seen = [];
  const inner = createMockCall();
  const call = async (body, options) => (seen.push(body), inner(body, options));
  const handler = createRunHandler({ call, rateLimitImpl: () => true, env: {} });
  const body = (extra) => ({ design: supervisorDesign(), task: "T", limits: {}, language: "en", apiKey: "sk-ant-api03-ABCDEFGHIJKLMNOPQRSTUVWX", ...extra });
  const fakeRes = () => ({ headers: {}, chunks: [], on() {}, setHeader() {}, flushHeaders() {}, write(c) { this.chunks.push(c); return true; }, end() {}, statusCode: 0 });
  const req = (b) => ({ method: "POST", headers: { "x-forwarded-for": "1.1.1.1" }, body: b });
  await handler(req(body({})), fakeRes());
  assert.ok(seen[0].replySchema, "on by default");
  seen.length = 0;
  await handler(req(body({ formatEnforcement: false })), fakeRes());
  assert.equal("replySchema" in seen[0], false);
});

test("the run client sends the switch only when it is off", () => {
  assert.match(read("../public/js/run-client.js"), /formatEnforcement === false \? \{ formatEnforcement: false \} : \{\}/);
  assert.match(read("../public/js/create/create-page.js"), /formatEnforcement: ctx\.settings\.get\(\)\.formatEnforcement/);
});

test("the Harness page Format, its texts and its Help section exist", () => {
  const page = read("../public/js/settings-page.js");
  assert.match(page, /\["format", "harness\.tabFormat", harnessFormatPage\]/);
  assert.match(page, /settings\.setFormatEnforcement\(/);
  assert.match(page, /harnessTools, harnessFormatPage, harnessBar/);
  for (const k of ["harness.tabFormat", "harness.formatHeading", "harness.formatIntro", "harness.format.on", "harness.format.onHint", "harness.format.off", "harness.format.offHint", "harness.formatNote"]) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
    assert.notEqual(cs[k], en[k], `cs ${k} is not translated`);
  }
  for (const [lang, locale] of [["en", en], ["cs", cs]]) {
    const found = findSection(locale["help.body"], "harness-format");
    assert.ok(found, lang);
    for (const rid of found.section.related) assert.ok(findSection(locale["help.body"], rid), `${lang} ${rid}`);
  }
});

test("a backup keeps the switch", () => {
  assert.match(read("../public/js/storage/backup.js"), /setFormatEnforcement\(/);
});
