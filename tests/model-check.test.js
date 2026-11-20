import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanModelList, MODEL_LIST_MAX } from "../public/js/engine/model-check.js";
import { listAnthropicModels } from "../public/js/engine/anthropic.js";
import { listGeminiModels } from "../public/js/engine/gemini.js";
import { MODELS, GOOGLE_MODELS } from "../public/js/engine/providers.js";

const KEY = "sk-ant-api03-LISTTESTKEY1234567890";
const reply = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

test("cleanModelList keeps clean ids only", () => {
  const raw = ["models/gemini-3.8-flash", "gemini-3.8-flash", 42, null, { id: "x" }, "has space", "<b>x</b>", "x".repeat(101), "good-id_1.2:free", "a/b"];
  const out = cleanModelList(raw, "google");
  assert.deepEqual(out.ids, ["gemini-3.8-flash", "good-id_1.2:free", "a/b"]);
  assert.equal(out.total, 3);
  assert.deepEqual(out.catalogFound, ["gemini-3.8-flash"]);
});

test("a catalog model after the cap is still found", () => {
  const raw = Array.from({ length: 300 }, (_, i) => `model-${i}`);
  raw.push(MODELS[1].id);
  const out = cleanModelList(raw, "anthropic");
  assert.equal(MODEL_LIST_MAX, 200);
  assert.equal(out.ids.length, 200);
  assert.equal(out.total, 301);
  assert.deepEqual(out.catalogFound, [MODELS[1].id]);
});

test("something that is not a list gives an empty answer", () => {
  for (const raw of ["not a list", null, undefined, 5, {}]) assert.deepEqual(cleanModelList(raw, "google"), { ids: [], total: 0, catalogFound: [] });
  assert.equal(cleanModelList(Array(100000).fill("x"), "anthropic").total, 1);
});

test("listAnthropicModels asks with the key and the version and returns the ids", async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, headers: init.headers, method: init.method });
    return reply({ data: [{ id: "claude-a" }, { id: "claude-b" }] });
  };
  assert.deepEqual(await listAnthropicModels({ apiKey: KEY, fetchImpl }), ["claude-a", "claude-b"]);
  assert.match(seen[0].url, /^https:\/\/api\.anthropic\.com\/v1\/models/);
  assert.equal(seen[0].method, "GET");
  assert.equal(seen[0].headers["x-api-key"], KEY);
  assert.equal(seen[0].headers["anthropic-version"], "2023-06-01");
});

test("listGeminiModels follows the pages", async () => {
  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    return url.includes("pageToken=P2") ? reply({ models: [{ name: "models/c" }] }) : reply({ models: [{ name: "models/a" }, { name: "models/b" }], nextPageToken: "P2" });
  };
  assert.deepEqual(await listGeminiModels({ apiKey: "AIza" + "x".repeat(35), fetchImpl }), ["models/a", "models/b", "models/c"]);
  assert.equal(urls.length, 2);
});

test("listGeminiModels stops after five pages", async () => {
  let n = 0;
  const fetchImpl = async () => reply({ models: [{ name: `models/m${n++}` }], nextPageToken: "again" });
  assert.equal((await listGeminiModels({ apiKey: "AIza" + "x".repeat(35), fetchImpl })).length, 5);
});

test("a refused list call throws with the status and never the key", async () => {
  const fetchImpl = async () => reply({ error: { message: `bad key ${KEY}` } }, 401);
  await assert.rejects(listAnthropicModels({ apiKey: KEY, fetchImpl }), (e) => e.status === 401 && !e.message.includes(KEY));
  const fetchNet = async () => {
    throw new Error(`network down for ${KEY}`);
  };
  await assert.rejects(listAnthropicModels({ apiKey: KEY, fetchImpl: fetchNet }), (e) => !e.message.includes(KEY) && e.status === 0);
  const G = "AIza" + "y".repeat(35);
  await assert.rejects(listGeminiModels({ apiKey: G, fetchImpl: async () => reply({ error: { message: `no ${G}` } }, 403) }), (e) => e.status === 403 && !e.message.includes(G));
});

test("the catalog ids are the ones the check looks for", () => {
  assert.deepEqual(cleanModelList(GOOGLE_MODELS.map((m) => m.id), "google").catalogFound, GOOGLE_MODELS.map((m) => m.id));
});
