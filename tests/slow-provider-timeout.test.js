import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { timeoutMsFor, SLOW_PROVIDER_TIMEOUT_FACTOR } from "../public/js/engine/catalog.js";

test("Cloudflare waits three times as long as the setting, the others as long as it", () => {
  assert.equal(SLOW_PROVIDER_TIMEOUT_FACTOR.cloudflare, 3);
  assert.deepEqual(["cloudflare", "groq", "openrouter", "google", "anthropic"].map((p) => timeoutMsFor(p, 60000)), [180000, 60000, 60000, 60000, 60000]);
});

test("the run handler gives every call the wait of its provider", () => {
  const source = readFileSync(new URL("../lib/run-handler.js", import.meta.url), "utf8");
  assert.ok(source.includes("timeoutMs: timeoutMsFor(provider, timeoutMs)"));
  assert.ok(source.includes("timeoutMsFor(slotProvider(node.slot), timeoutMs)"));
  assert.ok(!/signal, timeoutMs, fetchImpl/.test(source));
});
