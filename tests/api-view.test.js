import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { apiCallsOf, apiView } from "../public/js/replay/api-view.js";
import { PROVIDERS } from "../public/js/engine/providers.js";

class El {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  addEventListener(type, fn) {
    (this.listeners ??= {})[type] = fn;
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  find(pred, out = []) {
    for (const c of this.children) if (c instanceof El) {
      if (pred(c)) out.push(c);
      c.find(pred, out);
    }
    return out;
  }
  get text() {
    return this.children.map((c) => c.text).join("");
  }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const t = (key, params = {}) => (Object.keys(params).length ? `${key} ${JSON.stringify(params)}` : key);
const viewer = { view: (id, value) => { const el = new El("div"); el.setAttribute("data-viewer", id); el.append({ text: String(value) }); return el; } };

const call = (extra = {}) => ({
  type: "api_call", agent: "planner", provider: "anthropic", n: 1, t: 1, method: "POST", url: "https://api.anthropic.com/v1/messages",
  request: { headers: { "x-api-key": "(hidden)", "content-type": "application/json" }, body: '{"model":"claude-haiku-5-5","max_tokens":10}' },
  response: { status: 200, statusText: "OK", headers: { "request-id": "req_1" }, body: '{"usage":{"input_tokens":812,"output_tokens":240}}' },
  error: null, ms: 3100, truncated: { request: null, response: null }, ...extra,
});
const rows = (view) => view.find((e) => e.attrs["data-ui"] === "api-call");
const wireOf = (id) => PROVIDERS[id].wire;

test("apiCallsOf gives the calls of one agent, in order", () => {
  const all = [call({ n: 1 }), call({ agent: "writer" }), call({ n: 2 })];
  assert.deepEqual(apiCallsOf(all, "planner").map((c) => c.n), [1, 2]);
  assert.deepEqual(apiCallsOf(undefined, "planner"), []);
});

test("the view draws a row for each call in order", () => {
  const view = apiView({ doc, t, calls: [call({ n: 1, response: { status: 429, statusText: "Too Many Requests", headers: { "retry-after": "2" }, body: "{}" } }), call({ n: 2 })], wire: wireOf("anthropic"), viewer, query: "" });
  const r = rows(view);
  assert.equal(r.length, 2);
  assert.match(r[0].text, /429/);
  assert.match(r[1].text, /claude-haiku-5-5/);
  assert.match(r[1].text, /3\.1 s/);
  assert.match(r[1].text, /812/);
});

test("a 429 row is bad and a null response is no answer", () => {
  const view = apiView({ doc, t, calls: [call({ response: { status: 429, statusText: "x", headers: {}, body: "{}" } }), call({ n: 2, response: null, error: "timeout" })], wire: wireOf("anthropic"), viewer, query: "" });
  const badges = view.find((e) => e.tag === "span" && /\bst\b/.test(e.attrs.class ?? ""));
  assert.match(badges[0].attrs.class, /\bbad\b/);
  assert.match(badges[1].attrs.class, /\bnone\b/);
  assert.match(badges[1].text, /replay\.api\.noAnswer/);
});

test("the Sent column shows the method, the address, the hidden key and the body", () => {
  const view = apiView({ doc, t, calls: [call()], wire: wireOf("anthropic"), viewer, query: "", opened: new Map([["api-planner-1", true]]) });
  const text = rows(view)[0].text;
  assert.match(text, /POST https:\/\/api\.anthropic\.com\/v1\/messages/);
  assert.match(text, /x-api-key: \(hidden\)/);
  assert.ok(rows(view)[0].find((e) => e.attrs["data-viewer"] === "api-planner-1-req").length === 1);
  assert.ok(rows(view)[0].find((e) => e.attrs["data-viewer"] === "api-planner-1-res").length === 1);
});

test("a cut body shows its original size", () => {
  const view = apiView({ doc, t, calls: [call({ truncated: { request: 412 * 1024, response: null } })], wire: wireOf("anthropic"), viewer, query: "", opened: new Map([["api-planner-1", true]]) });
  assert.match(rows(view)[0].text, /replay\.api\.cut/);
});

test("a search word opens only the rows that contain it", () => {
  const calls = [call({ n: 1 }), call({ n: 2, request: { headers: {}, body: '{"model":"m","note":"needle"}' } })];
  const none = rows(apiView({ doc, t, calls, wire: wireOf("anthropic"), viewer, query: "" }));
  assert.ok(none.every((r) => r.attrs.open === undefined));
  const found = rows(apiView({ doc, t, calls, wire: wireOf("anthropic"), viewer, query: "NEEDLE" }));
  assert.equal(found[0].attrs.open, undefined);
  assert.notEqual(found[1].attrs.open, undefined);
});

test("the first failed call is open without a search", () => {
  const calls = [call({ n: 1 }), call({ n: 2, response: { status: 500, statusText: "x", headers: {}, body: "{}" } }), call({ n: 3, response: null, error: "boom" })];
  const r = rows(apiView({ doc, t, calls, wire: wireOf("anthropic"), viewer, query: "" }));
  assert.deepEqual(r.map((x) => x.attrs.open !== undefined), [false, true, false]);
});

test("Gemini shows the conversion table and Anthropic does not", () => {
  const g = apiView({ doc, t, calls: [call({ provider: "google" })], wire: wireOf("google"), viewer, query: "" });
  assert.equal(g.find((e) => e.attrs["data-ui"] === "api-table").length, 1);
  assert.match(g.find((e) => e.attrs["data-ui"] === "api-note")[0].text, /replay\.api\.noteConverted/);
  assert.match(g.find((e) => e.attrs["data-ui"] === "api-table")[0].text, /systemInstruction/);
  const a = apiView({ doc, t, calls: [call()], wire: wireOf("anthropic"), viewer, query: "" });
  assert.equal(a.find((e) => e.attrs["data-ui"] === "api-table").length, 0);
  assert.match(a.find((e) => e.attrs["data-ui"] === "api-note")[0].text, /replay\.api\.noteSame/);
});

test("no calls shows the note for a run recorded before the log", () => {
  const view = apiView({ doc, t, calls: [], wire: null, viewer, query: "" });
  assert.equal(view.attrs["data-ui"], "api-none");
  assert.match(view.text, /replay\.api\.old/);
});

test("a run whose calls were too large to keep says so", () => {
  const view = apiView({ doc, t, calls: [], wire: null, viewer, query: "", dropped: true });
  assert.match(view.text, /replay\.api\.dropped/);
});

test("html in a header, a body or an error is drawn as text, never as markup", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const view = apiView({ doc, t, calls: [call({ error: evil, response: null, url: `https://x.test/${evil}`, request: { headers: { "x-evil": evil }, body: evil } })], wire: wireOf("anthropic"), viewer, query: "" });
  const tags = new Set();
  const walk = (e) => { tags.add(e.tag); e.children.forEach((c) => c instanceof El && walk(c)); };
  walk(view);
  assert.equal(tags.has("img"), false);
  assert.match(view.text, /<img src=x onerror=alert\(1\)>/);
});

test("the registry gives every provider a wire note that exists in both languages, and Czech differs", () => {
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  const keys = ["player.tabApi", "replay.api.sent", "replay.api.received", "replay.api.noAnswer", "replay.api.cut", "replay.api.old", "replay.api.call", "replay.api.table.inside", "replay.api.table.sent", "replay.api.tokens", "replay.api.reasonOk", "replay.api.reasonRate", "replay.api.reasonError", "replay.api.reasonCancelled", "replay.api.reasonTimeout", "replay.api.nothing", "replay.api.hiddenNote", "replay.api.dropped", ...Object.values(PROVIDERS).map((p) => p.wire.noteKey)];
  for (const k of keys) {
    assert.equal(typeof en[k], "string", `en ${k}`);
    assert.equal(typeof cs[k], "string", `cs ${k}`);
    assert.notEqual(en[k], cs[k], `${k} is the same in both languages`);
    const params = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    assert.equal(params(en[k]), params(cs[k]), `${k} uses other parameters in Czech`);
  }
  for (const p of Object.values(PROVIDERS)) assert.ok(Array.isArray(p.wire.map));
});

test("the replay has the tab, and the Help has the section", () => {
  const view = readFileSync(new URL("../public/js/replay/view.js", import.meta.url), "utf8");
  assert.match(view, /"api"/);
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  assert.match(en["help.body"], /\{#replay-api\}/);
});

test("a row the student opened stays as chosen when the tab is drawn again", () => {
  const calls = [call({ n: 1, response: { status: 500, statusText: "x", headers: {}, body: "{}" } }), call({ n: 2 })];
  const opened = new Map([["api-planner-1", false], ["api-planner-2", true]]);
  const r = rows(apiView({ doc, t, calls, wire: wireOf("anthropic"), viewer, query: "", opened }));
  assert.deepEqual(r.map((x) => x.attrs.open !== undefined), [false, true]);
});

test("pressing a row remembers the choice", () => {
  const opened = new Map();
  const view = apiView({ doc, t, calls: [call({ n: 2 })], wire: wireOf("anthropic"), viewer, query: "", opened });
  const summary = rows(view)[0].find((e) => e.tag === "summary")[0];
  summary.listeners.click();
  assert.equal(opened.get("api-planner-2"), true);
  summary.listeners.click();
  assert.equal(opened.get("api-planner-2"), false);
});

test("a timeout and a cancel are shown in words of the page, an unknown error as it is", () => {
  const timeout = apiView({ doc, t, calls: [call({ response: null, error: "timeout" })], wire: wireOf("anthropic"), viewer, query: "" });
  assert.match(timeout.text, /replay\.api\.reasonTimeout/);
  assert.match(timeout.text, /replay\.api\.nothing/);
  assert.doesNotMatch(timeout.text, /aborted due to timeout/);
  const other = apiView({ doc, t, calls: [call({ response: null, error: "socket hang up" })], wire: wireOf("anthropic"), viewer, query: "" });
  assert.match(other.text, /socket hang up/);
});

// ---- the deferred minors of the first review ----

test("apiCallsOf can stop at the time of the played event", () => {
  const all = [call({ n: 1, t: 100 }), call({ n: 2, t: 500 }), call({ n: 3, t: 900 })];
  assert.deepEqual(apiCallsOf(all, "planner", 500).map((c) => c.n), [1, 2]);
  assert.deepEqual(apiCallsOf(all, "planner", -1), []);
  assert.equal(apiCallsOf(all, "planner").length, 3);
});

test("the note starts with a bold lead, and there is a read-only hint under the rows", () => {
  const v = apiView({ doc, t, calls: [call()], wire: wireOf("anthropic"), viewer, query: "" });
  assert.equal(v.find((e) => e.attrs["data-ui"] === "api-note")[0].find((e) => e.tag === "b").length, 1);
  assert.match(v.find((e) => e.attrs["data-ui"] === "api-note")[0].text, /replay\.api\.noteSameLead/);
  assert.equal(v.find((e) => e.attrs["data-ui"] === "api-hint").length, 1);
});

test("a failed call says how long the app waited before trying again, and a free key says so", () => {
  const calls = [call({ n: 1, t: 1000, ms: 400, response: { status: 429, statusText: "x", headers: {}, body: "{}" } }), call({ n: 2, t: 3500, ms: 500 })];
  const v = apiView({ doc, t, calls, wire: wireOf("anthropic"), viewer, query: "", free: true });
  const r = rows(v);
  assert.match(r[0].text, /replay\.api\.retried \{"s":2\}/);
  assert.doesNotMatch(r[1].text, /replay\.api\.retried/);
  assert.match(r[0].text, /replay\.api\.free/);
});

test("a cut body says after how many KB it was cut and how big it was", () => {
  const v = apiView({ doc, t, calls: [call({ truncated: { request: 412 * 1024, response: null } })], wire: wireOf("anthropic"), viewer, query: "", opened: new Map([["api-planner-1", true]]) });
  assert.match(rows(v)[0].text, /replay\.api\.cut \{"shown":300,"kb":412\}/);
});

test("a body that was not kept because the run was too large says so", () => {
  const v = apiView({ doc, t, calls: [call({ request: { headers: {}, body: "" }, truncated: { request: 5 * 1024 * 1024, response: null } })], wire: wireOf("anthropic"), viewer, query: "", opened: new Map([["api-planner-1", true]]) });
  assert.match(rows(v)[0].text, /replay\.api\.omitted \{"kb":5120\}/);
});

test("seconds are written by the number function of the page", () => {
  const v = apiView({ doc, t, calls: [call({ ms: 3100 })], wire: wireOf("anthropic"), viewer, query: "", num: (n) => n.toFixed(1).replace(".", ",") });
  assert.match(rows(v)[0].text, /3,1 s/);
});

test("the search also finds the pretty-printed form of a JSON body", () => {
  const calls = [call({ n: 1, request: { headers: {}, body: '{"role":"user","content":"hi"}' } }), call({ n: 2 })];
  const v = apiView({ doc, t, calls, wire: wireOf("anthropic"), viewer, query: '"role": "user"' });
  const r = rows(v);
  assert.notEqual(r[0].attrs.open, undefined);
  assert.equal(r[1].attrs.open, undefined);
});

test("a closed row builds no columns, an opened row builds them when pressed", () => {
  const opened = new Map();
  const v = apiView({ doc, t, calls: [call({ n: 1 }), call({ n: 2, response: { status: 500, statusText: "x", headers: {}, body: "{}" } })], wire: wireOf("anthropic"), viewer, query: "", opened });
  const [first, second] = rows(v);
  assert.equal(first.find((e) => e.attrs["data-viewer"]).length, 0, "closed row: no viewer");
  assert.equal(second.find((e) => e.attrs["data-viewer"]).length, 2, "open row: two viewers");
  first.find((e) => e.tag === "summary")[0].listeners.click();
  assert.equal(first.find((e) => e.attrs["data-viewer"]).length, 2, "pressed row: built");
});

test("an agent without calls in a run that has calls says it made none", () => {
  const v = apiView({ doc, t, calls: [], wire: null, viewer, query: "", runHasCalls: true });
  assert.match(v.text, /replay\.api\.none/);
  assert.doesNotMatch(v.text, /replay\.api\.old/);
});

test("the locale has the keys of these changes, Czech different", () => {
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  for (const k of ["replay.api.noteSameLead", "replay.api.noteConvertedLead", "replay.api.hint", "replay.api.retried", "replay.api.free", "replay.api.omitted", "replay.api.none"]) {
    assert.equal(typeof en[k], "string", `en ${k}`);
    assert.notEqual(en[k], cs[k], `${k} same`);
  }
  assert.deepEqual([...en["replay.api.cut"].matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(), ["kb", "shown"]);
});

test("the viewer keeps working for a JSON nested too deep to print", async () => {
  const { safeStringify } = await import("../public/js/replay/viewer.js");
  let deep = [];
  for (let i = 0; i < 100000; i++) deep = [deep];
  assert.equal(typeof safeStringify(deep, "fallback"), "string");
  assert.equal(safeStringify({ a: 1 }, "x"), '{\n  "a": 1\n}');
});
