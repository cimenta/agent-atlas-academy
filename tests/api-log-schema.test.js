import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EVENT_TYPES, validateRun } from "../public/js/run-schema.js";
import { runForExport } from "../public/js/run-export.js";
import { API_LOG_BODY_MAX } from "../public/js/engine/api-log.js";
import { exportBackup, parseBackup } from "../public/js/storage/backup.js";

const sample = () => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample-run.json"), "utf8"));

const call = (extra = {}) => ({
  type: "api_call",
  t: 0,
  agent: "",
  provider: "anthropic",
  n: 1,
  method: "POST",
  url: "https://api.anthropic.com/v1/messages",
  request: { headers: { "x-api-key": "(hidden)", "content-type": "application/json" }, body: '{"model":"m"}' },
  response: { status: 429, statusText: "Too Many Requests", headers: { "retry-after": "2", "request-id": "req_1", "anthropic-organization-id": "org_1", "x-ratelimit-remaining-tokens": "0", date: "today" }, body: '{"error":"slow"}' },
  error: null,
  ms: 400,
  truncated: { request: null, response: null },
  ...extra,
});

function withCall(extra) {
  const run = sample();
  const first = run.events.find((e) => e.type === "agent_start");
  run.apiCalls = [{ ...call(extra), agent: extra?.agent ?? first.agent, t: first.t }];
  return run;
}

test("the calls are kept beside the events, not among them: the player steps through events", () => {
  assert.equal(EVENT_TYPES.includes("api_call"), false);
  const withinEvents = sample();
  withinEvents.events.splice(1, 0, { ...call(), agent: withinEvents.events.find((e) => e.type === "agent_start").agent, t: 0 });
  assert.equal(validateRun(withinEvents).ok, false);
});

test("a valid api_call is accepted, also with no response and an error", () => {
  assert.deepEqual(validateRun(withCall()).errors, []);
  assert.deepEqual(validateRun(withCall({ response: null, error: "cancelled" })).errors, []);
});

test("an api_call with an unknown agent, a body over the cap, a non-string header or too many headers is refused", () => {
  assert.equal(validateRun(withCall({ agent: "nobody" })).ok, false);
  const big = withCall();
  big.apiCalls[0].response.body = "x".repeat(API_LOG_BODY_MAX + 1);
  assert.equal(validateRun(big).ok, false);
  const bad = withCall();
  bad.apiCalls[0].request.headers["x-n"] = 5;
  assert.equal(validateRun(bad).ok, false);
  const many = withCall();
  many.apiCalls[0].response.headers = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`h${i}`, "v"]));
  assert.equal(validateRun(many).ok, false);
  const noN = withCall({ n: 0 });
  assert.equal(validateRun(noN).ok, false);
  const tooMany = withCall();
  tooMany.apiCalls = Array.from({ length: 5001 }, () => tooMany.apiCalls[0] ?? call());
  assert.equal(validateRun(tooMany).ok, false);
  const html = withCall({ error: "<script>alert(1)</script>" });
  assert.equal(validateRun(html).ok, true, "html in a string is only text");
});

test("export hides identifying response headers and keeps retry-after and the rate limit headers", () => {
  const out = runForExport(withCall());
  const headers = out.apiCalls[0].response.headers;
  assert.equal(headers["retry-after"], "2");
  assert.equal(headers["x-ratelimit-remaining-tokens"], "0");
  assert.equal(headers.date, "today");
  assert.equal(headers["request-id"], "(hidden)");
  assert.equal(headers["anthropic-organization-id"], "(hidden)");
  assert.deepEqual(validateRun(out).errors, []);
});

test("export does not change the stored run", () => {
  const run = withCall();
  runForExport(run);
  assert.equal(run.apiCalls[0].response.headers["request-id"], "req_1");
});

test("buildRunRecord keeps the calls beside the events, and leaves the field out when there are none", async () => {
  const { buildRunRecord } = await import("../public/js/engine/run-record.js");
  const base = { id: "local-1", design: { pattern: "sequential", nodes: [{ id: "a", agent: "planner", model: "fast" }], edges: [] }, task: "t", events: [{ t: 0, type: "run_start" }], limits: {}, language: "en", appVersion: "1" };
  assert.equal("apiCalls" in buildRunRecord(base), false);
  assert.equal(buildRunRecord({ ...base, apiCalls: [call({ agent: "a" })] }).apiCalls.length, 1);
});

test("a backup keeps the api_call events", () => {
  const run = withCall();
  const text = JSON.stringify(exportBackup({ runs: [run], settings: {}, appVersion: "x" }));
  const parsed = parseBackup(text);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.backup.runs[0].apiCalls.length, 1);
});
