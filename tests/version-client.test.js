import { test } from "node:test";
import assert from "node:assert/strict";
import { loadVersion } from "../public/js/version.js";

test("loadVersion returns the version from version.json", async () => {
  const fetchFn = async (url) => {
    assert.equal(url, "/version.json");
    return { ok: true, json: async () => ({ version: "0.1.0" }) };
  };
  assert.equal(await loadVersion(fetchFn), "0.1.0");
});

test("loadVersion says unknown when the request fails", async () => {
  assert.equal(await loadVersion(async () => Promise.reject(new Error("net"))), "unknown");
  assert.equal(await loadVersion(async () => ({ ok: false })), "unknown");
});

test("loadVersion says unknown for malformed data", async () => {
  assert.equal(await loadVersion(async () => ({ ok: true, json: async () => Promise.reject(new Error("bad json")) })), "unknown");
  assert.equal(await loadVersion(async () => ({ ok: true, json: async () => ({}) })), "unknown");
  assert.equal(await loadVersion(async () => ({ ok: true, json: async () => ({ version: "<b>x</b>" }) })), "unknown");
});
