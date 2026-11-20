import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createCloudflareMock, mockCloudflareList } from "../scripts/mock-cloudflare.js";
import { callCloudflare } from "../public/js/engine/cloudflare.js";
import { PROVIDERS } from "../public/js/engine/providers.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
const KEY = `${"0123456789abcdef".repeat(2)}:${"T".repeat(40)}`;
const mockCall = async (body) => ({ content: [{ type: "text", text: `Echo: ${body.messages[0].content}` }] });
const fetchOver = (mock) => async (url, init) => {
  const r = await mock(JSON.parse(init.body));
  return { ok: r.status < 400, status: r.status, headers: new Map(Object.entries(r.headers)), json: async () => r.body };
};
const one = (fetchImpl) => () => callCloudflare({ model: "@cf/openai/gpt-oss-120b", max_tokens: 500, system: "s", messages: [{ role: "user", content: [{ type: "text", text: "q" }] }] }, { apiKey: KEY, fetchImpl });

test("the Cloudflare mock reads max_completion_tokens and answers with usage that the real adapter reads", async () => {
  let seen;
  const mock = createCloudflareMock({ mockCall: async (body) => { seen = body; return mockCall(body); }, mode: "" });
  const answer = await one(fetchOver(mock))();
  assert.equal(answer.content[0].text, "Echo: q");
  assert.equal(seen.max_tokens, 500);
  assert.ok(answer.usage.input_tokens > 0);
});

test("in quota mode every third call answers that the daily allocation is used up, and the adapter turns it into a day limit", async () => {
  const call = one(fetchOver(createCloudflareMock({ mockCall, mode: "quota" })));
  await call();
  await call();
  await assert.rejects(call, (error) => error.status === 429 && error.rateKind === "day");
  await call();
});

test("the mock list holds the three ids and two made-up ones", () => {
  const ids = mockCloudflareList();
  for (const m of PROVIDERS.cloudflare.models) assert.ok(ids.includes(m.id));
  assert.equal(ids.length, 5);
});

test("the Cloudflare registry entry has the wire table and the notes exist in both languages", () => {
  const wire = PROVIDERS.cloudflare.wire;
  assert.ok(wire.map.length >= 4);
  assert.ok(wire.map.some(([from, to]) => from === "max_tokens" && to === "max_completion_tokens"));
  assert.equal(typeof en[wire.noteKey], "string");
  assert.equal(typeof cs[wire.noteKey], "string");
  assert.notEqual(en[wire.noteKey], cs[wire.noteKey]);
});

test("Help has a Cloudflare section in both languages and the privacy text names Cloudflare", () => {
  for (const d of [en, cs]) assert.match(d["help.body"], /### [^\n]+ \{#cloudflare\}/);
  const ids = (s) => [...s.matchAll(/\{#([\w-]+)\}/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids(en["help.body"]), ids(cs["help.body"]));
  for (const lang of ["en", "cs"]) {
    const text = readFileSync(new URL(`../public/content/pages/${lang}/privacy.md`, import.meta.url), "utf8");
    assert.match(text, /Cloudflare/);
  }
});
