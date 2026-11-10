import { test } from "node:test";
import assert from "node:assert/strict";
import { runForExport } from "../public/js/run-export.js";
import { validateRun } from "../public/js/run-schema.js";

const run = () => ({
  schemaVersion: 1,
  id: "local-x",
  title: "t",
  language: "en",
  pattern: "sequential",
  recordedWith: { provider: "anthropic", model: "claude-haiku-5-5" },
  appVersion: "0.6.1",
  client: { language: "en-US", timezone: "Europe/Prague", userAgent: "Mozilla/5.0" },
  about: { title: "Kept" },
  events: [
    { t: 0, type: "run_start" },
    { t: 1, type: "agent_start", agent: "a" },
    { t: 2, type: "round", agent: "a", raw: { response: { id: "msg_1" }, http: { status: 200, requestId: "req_1", headers: { "anthropic-ratelimit-requests-limit": "13000" }, ms: 5 } } },
  ],
});

test("an exported run has no client data and no response headers", () => {
  const out = runForExport(run());
  assert.equal("client" in out, false);
  assert.equal("headers" in out.events[2].raw.http, false);
  assert.equal(out.events[2].raw.http.status, 200);
  assert.equal(JSON.stringify(out).includes("Europe/Prague"), false);
  assert.equal(JSON.stringify(out).includes("ratelimit"), false);
});

test("the export keeps the rest of the run and leaves the original untouched", () => {
  const original = run();
  const out = runForExport(original);
  assert.equal(out.about.title, "Kept");
  assert.equal(validateRun(out).ok, true);
  assert.equal(original.client.timezone, "Europe/Prague");
  assert.ok(original.events[2].raw.http.headers);
});
