import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimit } from "../lib/rate-limit.js";

test("allows max calls in the window, rejects the next, allows again after the window", () => {
  const key = "ip-a";
  const t0 = 1_000_000;
  for (let i = 0; i < 3; i++) assert.equal(rateLimit(key, 3, 1000, t0 + i), true);
  assert.equal(rateLimit(key, 3, 1000, t0 + 10), false);
  assert.equal(rateLimit(key, 3, 1000, t0 + 1001), true);
});

test("keys are counted separately", () => {
  const t0 = 2_000_000;
  assert.equal(rateLimit("ip-b", 1, 1000, t0), true);
  assert.equal(rateLimit("ip-b", 1, 1000, t0 + 1), false);
  assert.equal(rateLimit("ip-c", 1, 1000, t0 + 1), true);
});
