import { test } from "node:test";
import assert from "node:assert/strict";
import { API_LOG_BODY_MAX, HIDDEN, hideHeaders, cutBody, recordingFetch } from "../public/js/engine/api-log.js";

const answer = (status, body, headers = {}) => new Response(body, { status, statusText: status === 429 ? "Too Many Requests" : "OK", headers });

test("hideHeaders hides keys, tokens and cookies and keeps rate limit headers", () => {
  const out = hideHeaders({ "X-Api-Key": "sk-ant-secret", Authorization: "Bearer abc", "x-goog-api-key": "g", "Set-Cookie": "a=b", "x-token-count": "5", "retry-after": "2", "x-ratelimit-remaining-tokens": "10" });
  assert.equal(out["x-api-key"], HIDDEN);
  assert.equal(out.authorization, HIDDEN);
  assert.equal(out["x-goog-api-key"], HIDDEN);
  assert.equal(out["set-cookie"], HIDDEN);
  assert.equal(out["x-token-count"], HIDDEN);
  assert.equal(out["retry-after"], "2");
  assert.equal(out["x-ratelimit-remaining-tokens"], "10");
});

test("hideHeaders reads a Headers object and a list of pairs", () => {
  assert.deepEqual(hideHeaders(new Headers({ "Content-Type": "application/json" })), { "content-type": "application/json" });
  assert.deepEqual(hideHeaders([["Date", "today"]]), { date: "today" });
});

test("a recorded call has request, response, time and number", async () => {
  const sink = [];
  let t = 1000;
  const f = recordingFetch(sink, { baseFetch: async () => answer(200, '{"ok":true}', { "content-type": "application/json", "request-id": "r1" }), now: () => (t += 50) });
  const res = await f("https://api.example.com/v1/messages", { method: "POST", headers: { "x-api-key": "SECRETKEY" }, body: '{"a":1}' });
  assert.equal(res.status, 200);
  assert.equal(sink.length, 1);
  const e = sink[0];
  assert.equal(e.n, 1);
  assert.equal(e.method, "POST");
  assert.equal(e.url, "https://api.example.com/v1/messages");
  assert.equal(e.request.headers["x-api-key"], HIDDEN);
  assert.equal(e.request.body, '{"a":1}');
  assert.equal(e.response.status, 200);
  assert.equal(e.response.body, '{"ok":true}');
  assert.equal(e.response.headers["content-type"], "application/json");
  assert.equal(e.error, null);
  assert.equal(e.ms, 50);
  assert.deepEqual(e.truncated, { request: null, response: null });
  assert.doesNotMatch(JSON.stringify(e), /SECRETKEY/);
});

test("an error status is recorded and the response is returned unread", async () => {
  const sink = [];
  const f = recordingFetch(sink, { baseFetch: async () => answer(429, '{"error":"slow down"}', { "retry-after": "2" }) });
  const res = await f("https://x.test/", { method: "POST", body: "{}" });
  assert.equal(res.status, 429);
  assert.deepEqual(await res.json(), { error: "slow down" });
  assert.equal(sink[0].response.status, 429);
  assert.equal(sink[0].response.headers["retry-after"], "2");
  const second = await recordingFetch(sink, { baseFetch: async () => answer(200, "{}") })("https://x.test/", {});
  assert.equal(second.status, 200);
});

test("a retry on the same recording fetch gets the next number", async () => {
  const sink = [];
  let calls = 0;
  const f = recordingFetch(sink, { baseFetch: async () => answer(++calls === 1 ? 429 : 200, "{}") });
  await f("https://x.test/", { method: "POST", body: "{}" });
  await f("https://x.test/", { method: "POST", body: "{}" });
  assert.deepEqual(sink.map((e) => e.n), [1, 2]);
});

test("a thrown fetch is recorded with the error and rethrown", async () => {
  const sink = [];
  const f = recordingFetch(sink, { baseFetch: async () => { throw new TypeError("network down"); } });
  await assert.rejects(() => f("https://x.test/", { method: "POST", body: "{}" }), /network down/);
  assert.equal(sink.length, 1);
  assert.equal(sink[0].response, null);
  assert.match(sink[0].error, /network down/);
});

test("an aborted call is recorded as cancelled", async () => {
  const sink = [];
  const f = recordingFetch(sink, { baseFetch: async () => { throw new DOMException("aborted", "AbortError"); } });
  await assert.rejects(() => f("https://x.test/", {}), /aborted/);
  assert.equal(sink[0].error, "cancelled");
});

test("a body over the cap is cut and its size kept", async () => {
  const big = "x".repeat(API_LOG_BODY_MAX + 500);
  const sink = [];
  const f = recordingFetch(sink, { baseFetch: async () => answer(200, big) });
  await f("https://x.test/", { method: "POST", body: big });
  assert.equal(sink[0].request.body.length, API_LOG_BODY_MAX);
  assert.equal(sink[0].response.body.length, API_LOG_BODY_MAX);
  assert.equal(sink[0].truncated.request, API_LOG_BODY_MAX + 500);
  assert.equal(sink[0].truncated.response, API_LOG_BODY_MAX + 500);
  assert.deepEqual(cutBody("abc", 10), { text: "abc", bytes: null });
});

test("a request body that is not text is noted", async () => {
  const sink = [];
  const f = recordingFetch(sink, { baseFetch: async () => answer(200, "{}") });
  await f("https://x.test/", { method: "POST", body: new Uint8Array([1, 2, 3]) });
  assert.equal(sink[0].request.body, "(not text)");
});

test("a timeout is recorded as timeout", async () => {
  const sink = [];
  const f = recordingFetch(sink, { baseFetch: async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); } });
  await assert.rejects(() => f("https://x.test/", {}));
  assert.equal(sink[0].error, "timeout");
});

test("every string of an entry is cut to the bounds the run schema accepts", async () => {
  const { API_TEXT_MAX, API_HEADERS_MAX, API_HEADER_VALUE_MAX } = await import("../public/js/engine/api-log.js");
  const sink = [];
  const many = Object.fromEntries(Array.from({ length: 150 }, (_, i) => [`x-h${i}`, "v".repeat(5000)]));
  const f = recordingFetch(sink, { baseFetch: async () => new Response("{}", { status: 500, headers: many }) });
  await f(`https://x.test/${"u".repeat(5000)}`, { method: "POST", headers: many, body: "{}" });
  const e = sink[0];
  assert.ok(Object.keys(e.response.headers).length <= API_HEADERS_MAX);
  assert.ok(Object.keys(e.request.headers).length <= API_HEADERS_MAX);
  assert.ok(Object.values(e.response.headers).every((v) => v.length <= API_HEADER_VALUE_MAX));
  assert.ok(e.url.length <= API_TEXT_MAX);
  const g = recordingFetch([], { baseFetch: async () => { throw new Error("e".repeat(9000)); } });
  const s2 = [];
  await assert.rejects(() => recordingFetch(s2, { baseFetch: async () => { throw new Error("e".repeat(9000)); } })("https://x.test/", {}));
  assert.ok(s2[0].error.length <= API_TEXT_MAX);
  assert.equal(typeof g, "function");
});

test("a call cancelled while its body downloads is recorded as cancelled", async () => {
  const sink = [];
  const broken = { status: 200, statusText: "OK", headers: new Headers(), clone() { return { text: async () => { throw new DOMException("aborted", "AbortError"); } }; } };
  const f = recordingFetch(sink, { baseFetch: async () => broken });
  await f("https://x.test/", {});
  assert.equal(sink[0].error, "cancelled");
  assert.equal(sink[0].response.status, 200);
});
