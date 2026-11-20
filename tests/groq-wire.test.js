import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createGroqMock } from "../scripts/mock-groq.js";
import { callChatCompletions } from "../public/js/engine/openai-compat.js";
import { PROVIDERS } from "../public/js/engine/providers.js";

const chat = { model: "openai/gpt-oss-20b", max_completion_tokens: 500, messages: [{ role: "system", content: "Role: writer" }, { role: "user", content: "Write one line." }] };
const mockCall = async (body) => ({ content: [{ type: "text", text: `Echo: ${body.messages[0].content}` }] });
// the mock as a fetch, so the real adapter reads what it returns
const fetchOver = (mock) => async (url, init) => {
  const r = await mock(JSON.parse(init.body));
  return { ok: r.status < 400, status: r.status, headers: new Map(Object.entries(r.headers)), json: async () => r.body };
};

test("the Groq mock answers like Groq and the real adapter reads it", async () => {
  const answer = await callChatCompletions({ model: chat.model, max_tokens: 500, system: "Role: writer", messages: [{ role: "user", content: [{ type: "text", text: "Write one line." }] }] }, { apiKey: "mock", url: "http://x", fetchImpl: fetchOver(createGroqMock({ mockCall, mode: "" })) });
  assert.equal(answer.content[0].text, "Echo: Write one line.");
  assert.ok(answer.usage.input_tokens > 0 && !answer.usage.estimated);
});

test("every third call is a 429 in minute mode, with retry-after, and a day limit in day mode", async () => {
  for (const [mode, kind, wait] of [["minute", "minute", 23], ["day", "day", 21600]]) {
    const fetchImpl = fetchOver(createGroqMock({ mockCall, mode }));
    const call = () => callChatCompletions({ model: chat.model, max_tokens: 500, system: "s", messages: [{ role: "user", content: [{ type: "text", text: "q" }] }] }, { apiKey: "mock", url: "http://x", fetchImpl });
    await call();
    await call();
    await assert.rejects(call, (error) => error.status === 429 && error.rateKind === kind && error.retryAfterSec === wait);
    await call();
  }
});

test("the Groq registry entry has the wire table and the notes exist in both languages", () => {
  const wire = PROVIDERS.groq.wire;
  assert.ok(wire.map.length >= 4);
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  assert.equal(typeof en[wire.noteKey], "string");
  assert.equal(typeof cs[wire.noteKey], "string");
});

test("Help has a Groq section in both languages and the privacy text names Groq", () => {
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  for (const d of [en, cs]) assert.match(d["help.body"], /### [^\n]+ \{#groq\}/);
  const ids = (s) => [...s.matchAll(/\{#([\w-]+)\}/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids(en["help.body"]), ids(cs["help.body"]));
  for (const lang of ["en", "cs"]) assert.match(readFileSync(new URL(`../public/content/pages/${lang}/privacy.md`, import.meta.url), "utf8"), /Groq/);
});

test("a voting run on the Groq mock reaches a valid decision on the first tally reply", async () => {
  const { createMockCall } = await import("../public/js/engine/mock-anthropic.js");
  const { runDesign } = await import("../public/js/engine/orchestrator.js");
  const { LIMIT_DEFAULTS } = await import("../public/js/engine/catalog.js");
  const fetchImpl = fetchOver(createGroqMock({ mockCall: createMockCall({}), mode: "" }));
  const n = (id, agent) => ({ id, agent, model: "fast", search: false, slot: "groq-free" });
  const design = { pattern: "voting", nodes: [n("a", "planner"), n("b", "researcher"), n("c", "critic"), n("tally", "tally")], edges: ["a", "b", "c"].map((x) => ({ from: x, to: "tally" })) };
  let tallyCalls = 0;
  const call = (body) => {
    if (String(body.system).startsWith("Role: tally")) tallyCalls += 1;
    return callChatCompletions(body, { apiKey: "k", url: "http://x", fetchImpl });
  };
  await runDesign({ design, task: "t", limits: LIMIT_DEFAULTS, call, emit: () => {} });
  assert.equal(tallyCalls, 1);
});
