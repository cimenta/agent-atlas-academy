import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createOpenrouterMock, mockOpenrouterList } from "../scripts/mock-openrouter.js";
import { callOpenrouter } from "../public/js/engine/openrouter.js";
import { callChatCompletions } from "../public/js/engine/openai-compat.js";
import { PROVIDERS } from "../public/js/engine/providers.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
const mockCall = async (body) => ({ content: [{ type: "text", text: `Echo: ${body.messages[0].content}` }] });
const fetchOver = (mock) => async (url, init) => {
  const r = await mock(JSON.parse(init.body));
  return { ok: r.status < 400, status: r.status, headers: new Map(Object.entries(r.headers)), json: async () => r.body };
};
const one = (fetchImpl) => () => callChatCompletions({ model: "google/gemma-4-26b-a4b-it:free", max_tokens: 500, system: "s", messages: [{ role: "user", content: [{ type: "text", text: "q" }] }] }, { apiKey: "mock", url: "http://x", fetchImpl, maxTokensField: "max_tokens", reasoningEffort: null, who: "OpenRouter" });

test("the OpenRouter mock reads max_tokens and answers like OpenRouter", async () => {
  let seen;
  const mock = createOpenrouterMock({ mockCall: async (body) => { seen = body; return mockCall(body); }, mode: "" });
  const answer = await one(fetchOver(mock))();
  assert.equal(answer.content[0].text, "Echo: q");
  assert.equal(seen.max_tokens, 500);
  assert.ok(answer.usage.input_tokens > 0);
});

test("every third call is a 429 in minute mode and a day limit in day mode", async () => {
  for (const [mode, kind] of [["minute", "minute"], ["day", "day"]]) {
    const call = one(fetchOver(createOpenrouterMock({ mockCall, mode })));
    await call();
    await call();
    await assert.rejects(call, (error) => error.status === 429 && error.rateKind === kind);
    await call();
  }
});

test("the mock list holds the free ids, and gone mode hides one of them", () => {
  const free = PROVIDERS.openrouter.models.map((m) => m.freeId).filter(Boolean);
  const all = mockOpenrouterList({ mode: "" });
  for (const id of free) assert.ok(all.ids.includes(id));
  assert.ok(all.models.every((m) => typeof m.name === "string" && typeof m.tools === "boolean"));
  const gone = mockOpenrouterList({ mode: "gone" });
  assert.equal(free.filter((id) => !gone.ids.includes(id)).length, 1);
  assert.ok(gone.models.some((m) => m.id.endsWith(":free") && !free.includes(m.id)), "a candidate to pick");
});

test("the OpenRouter registry entry has the wire table and the notes exist in both languages", () => {
  const wire = PROVIDERS.openrouter.wire;
  assert.ok(wire.map.length >= 4);
  assert.equal(typeof en[wire.noteKey], "string");
  assert.equal(typeof cs[wire.noteKey], "string");
  assert.notEqual(en[wire.noteKey], cs[wire.noteKey]);
  assert.equal(typeof callOpenrouter, "function");
});

test("Help has an OpenRouter section in both languages and the privacy text names OpenRouter", () => {
  for (const d of [en, cs]) assert.match(d["help.body"], /### [^\n]+ \{#openrouter\}/);
  const ids = (s) => [...s.matchAll(/\{#([\w-]+)\}/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids(en["help.body"]), ids(cs["help.body"]));
  for (const lang of ["en", "cs"]) assert.match(readFileSync(new URL(`../public/content/pages/${lang}/privacy.md`, import.meta.url), "utf8"), /OpenRouter/);
});
