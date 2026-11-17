import { test } from "node:test";
import assert from "node:assert/strict";
import { RETRIES, RETRY_DELAY_SEC, clampRetries, clampRetryDelaySec } from "../public/js/engine/catalog.js";
import { createSettingsStore } from "../public/js/storage/settings.js";

test("retries are clipped to 0 to 3 and default to one", () => {
  assert.equal(clampRetries(undefined), RETRIES.default);
  assert.equal(clampRetries("abc"), RETRIES.default);
  assert.equal(clampRetries(-4), 0);
  assert.equal(clampRetries(9), 3);
  assert.equal(clampRetries(2.4), 2);
  assert.equal(clampRetries(0), 0);
});

test("the delay is clipped to 1 to 10 seconds in half seconds and defaults to 1.5", () => {
  assert.equal(clampRetryDelaySec(undefined), RETRY_DELAY_SEC.default);
  assert.equal(clampRetryDelaySec(null), RETRY_DELAY_SEC.default);
  assert.equal(clampRetryDelaySec(0), 1);
  assert.equal(clampRetryDelaySec(99), 10);
  assert.equal(clampRetryDelaySec(2.3), 2.5);
});

test("the settings store keeps and clips the retry settings", () => {
  const data = {};
  const storage = { getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
  const store = createSettingsStore(storage);
  assert.equal(store.get().retries, 1);
  assert.equal(store.get().retryDelaySec, 1.5);
  store.setRetries(3, 6);
  assert.deepEqual([store.get().retries, store.get().retryDelaySec], [3, 6]);
  store.setRetries(50, 50);
  assert.deepEqual([store.get().retries, store.get().retryDelaySec], [3, 10]);
});

import { PROFILES, matchProfile, LIMIT_MAX, OUTPUT_TOKENS, TIMEOUT_SEC, LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { readFileSync } from "node:fs";

test("every profile stays inside the ranges and balanced equals the defaults", () => {
  for (const [id, p] of Object.entries(PROFILES)) {
    assert.ok(p.steps >= 1 && p.steps <= LIMIT_MAX.maxSteps, id);
    assert.ok(p.tokens <= LIMIT_MAX.maxTokens && p.tokens % 5000 === 0, id);
    assert.ok(p.searches >= 0 && p.searches <= LIMIT_MAX.maxSearches, id);
    assert.ok(p.output >= OUTPUT_TOKENS.min && p.output <= OUTPUT_TOKENS.max, id);
    assert.ok(p.timeout >= TIMEOUT_SEC.min && p.timeout <= TIMEOUT_SEC.max && p.timeout % TIMEOUT_SEC.step === 0, id);
  }
  assert.equal(PROFILES.balanced.steps, LIMIT_DEFAULTS.maxSteps);
  assert.equal(PROFILES.balanced.tokens, LIMIT_DEFAULTS.maxTokens);
});

test("matchProfile names the profile with exactly these values, else custom", () => {
  assert.equal(matchProfile(PROFILES.careful), "careful");
  assert.equal(matchProfile(PROFILES.balanced), "balanced");
  assert.equal(matchProfile(PROFILES.generous), "generous");
  assert.equal(matchProfile({ ...PROFILES.balanced, steps: 21 }), "custom");
  assert.equal(matchProfile(undefined), "custom");
});

test("the profile and retry texts exist in both languages", () => {
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  const keys = ["harness.profileHeading", "harness.profileIntro", "harness.profileDone", "harness.limitsHeading", "harness.retriesHeading", "harness.retriesIntro", "harness.retriesNote", "harness.limit.retries.label", "harness.limit.retries.hint", "harness.limit.retryDelay.label", "harness.limit.retryDelay.hint"];
  for (const id of [...Object.keys(PROFILES), "custom"]) keys.push(`harness.profile.${id}`, `harness.profile.${id}.hint`);
  for (const k of keys) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
  }
});
