import { test } from "node:test";
import assert from "node:assert/strict";
import { wikipediaText, weatherText } from "../public/js/engine/web-tools.js";
import { runTool, TOOLS, toolsFor } from "../public/js/engine/tools.js";
import { createBudget } from "../public/js/engine/budget.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const json = (data, status = 200) => ({ ok: status < 200 || status >= 300 ? false : true, status, text: async () => JSON.stringify(data) });
const wikiPage = { query: { pages: { 7: { title: "Alan Turing", extract: "Alan Turing was an English mathematician.", fullurl: "https://en.wikipedia.org/wiki/Alan_Turing" } } } };
const geo = { results: [{ name: "Brno", admin1: "South Moravia", country: "Czechia", latitude: 49.19, longitude: 16.61 }] };
const forecast = { current: { temperature_2m: 4.26, precipitation: 0, wind_speed_10m: 12, weather_code: 3 }, daily: { time: ["2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28"], temperature_2m_min: [1, 2, 0, -1], temperature_2m_max: [5, 6, 4, 3], precipitation_sum: [0, 1.5, 0, 0], wind_speed_10m_max: [20, 25, 10, 8] } };

test("Wikipedia gives the title, the summary and the address, from the fixed host in the chosen language", async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return json(wikiPage); };
  const out = await wikipediaText({ query: "Alan Turing", language: "cs" }, { fetchImpl });
  assert.match(out, /^Alan Turing \(Wikipedia, cs\)/);
  assert.match(out, /English mathematician/);
  assert.match(out, /wikipedia\.org\/wiki\/Alan_Turing/);
  assert.ok(urls[0].startsWith("https://cs.wikipedia.org/w/api.php"));
  assert.ok(urls[0].includes("Alan%20Turing"));
});

test("Wikipedia refuses an empty query, a long one and a language it does not offer, without any call", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return json(wikiPage); };
  for (const bad of [{}, { query: "  " }, { query: "x".repeat(201) }, { query: "a", language: "de" }, { query: "a.evil.com/", language: "en.evil.com/x" }]) {
    await assert.rejects(() => wikipediaText(bad, { fetchImpl }), (e) => e.name === "ToolError");
  }
  assert.equal(calls, 0);
});

test("Wikipedia says so when there is no page, and a service error is a text for the model", async () => {
  await assert.rejects(() => wikipediaText({ query: "zzzz" }, { fetchImpl: async () => json({ batchcomplete: "" }) }), /no page/);
  await assert.rejects(() => wikipediaText({ query: "a" }, { fetchImpl: async () => json({}, 503) }), /error 503/);
  await assert.rejects(() => wikipediaText({ query: "a" }, { fetchImpl: async () => { throw new Error("down"); } }), /cannot be reached/);
  await assert.rejects(() => wikipediaText({ query: "a" }, { fetchImpl: async () => ({ ok: true, status: 200, text: async () => "<html>" }) }), /not readable/);
  await assert.rejects(() => wikipediaText({ query: "a" }, { fetchImpl: async () => ({ ok: true, status: 200, text: async () => "x".repeat(300001) }) }), /too much data/);
});

test("a 429 or 503 answer is tried once more after a short wait, then reported", async () => {
  let calls = 0;
  const flaky = async () => { calls += 1; return calls === 1 ? json({}, 429) : json(wikiPage); };
  const out = await wikipediaText({ query: "Alan Turing" }, { fetchImpl: flaky, retryDelayMs: 1 });
  assert.match(out, /Alan Turing/);
  assert.equal(calls, 2);
  let always = 0;
  await assert.rejects(() => wikipediaText({ query: "a" }, { fetchImpl: async () => { always += 1; return json({}, 429); }, retryDelayMs: 1 }), /error 429/);
  assert.equal(always, 2);
  let notFound = 0;
  await assert.rejects(() => wikipediaText({ query: "a" }, { fetchImpl: async () => { notFound += 1; return json({}, 404); }, retryDelayMs: 1 }), /error 404/);
  assert.equal(notFound, 1);
});

test("a call that does not answer in time stops with a text, it does not hang", async () => {
  const fetchImpl = (url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))));
  const started = Date.now();
  await assert.rejects(() => wikipediaText({ query: "a" }, { fetchImpl, timeoutMs: 30 }), /did not answer within/);
  assert.ok(Date.now() - started < 2000);
});

test("the weather looks the place up, then gives now and the next 3 days", async () => {
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); return url.includes("geocoding") ? json(geo) : json(forecast); };
  const out = await weatherText({ place: "Brno" }, { fetchImpl });
  assert.match(out, /Weather in Brno, South Moravia, Czechia/);
  assert.match(out, /Now: 4\.3 C, overcast, rain 0 mm, wind 12 km\/h/);
  assert.match(out, /2026-11-26: 2 to 6 C, rain 1\.5 mm, wind up to 25 km\/h/);
  assert.equal(out.split("\n").length, 6);
  assert.ok(urls[0].startsWith("https://geocoding-api.open-meteo.com/"));
  assert.ok(urls[1].startsWith("https://api.open-meteo.com/v1/forecast?latitude=49.19&longitude=16.61"));
});

test("the weather says so when the place is unknown or a service fails", async () => {
  await assert.rejects(() => weatherText({ place: "Nowhereville" }, { fetchImpl: async () => json({}) }), /No place was found/);
  await assert.rejects(() => weatherText({}, { fetchImpl: async () => json(geo) }), /place is needed/i);
  await assert.rejects(() => weatherText({ place: "Brno" }, { fetchImpl: async (u) => (u.includes("geocoding") ? json(geo) : json({}, 500)) }), /error 500/);
  await assert.rejects(() => weatherText({ place: "Brno" }, { fetchImpl: async (u) => (u.includes("geocoding") ? json(geo) : json({})) }), /no forecast/);
});

test("runTool runs both through the tools table, and turns a failure into an error result, never a throw", async () => {
  const fetchImpl = async (url) => (url.includes("wikipedia") ? json(wikiPage) : json({}, 502));
  const ok = await runTool("wikipedia", { query: "Alan Turing" }, { fetch: fetchImpl });
  assert.equal(ok.error, false);
  assert.match(ok.output, /Alan Turing/);
  const bad = await runTool("weather", { place: "Brno" }, { fetch: fetchImpl });
  assert.equal(bad.error, true);
  assert.match(bad.output, /error 502/);
});

test("the two tools are definitions the providers can take, and an agent is given them when switched on", () => {
  for (const key of ["wikipedia", "weather"]) {
    assert.equal(TOOLS[key].kind, "own");
    assert.equal(TOOLS[key].extraFee, false);
    assert.equal(TOOLS[key].schema.type, "object");
  }
  assert.deepEqual(TOOLS.wikipedia.schema.required, ["query"]);
  assert.deepEqual(TOOLS.weather.schema.required, ["place"]);
  const names = toolsFor({ id: "a", model: "fast", search: false, tools: ["weather", "wikipedia"] }, createBudget(LIMIT_DEFAULTS), "groq").map((t) => t.name);
  assert.deepEqual(names, ["weather", "wikipedia"], "in the order of the agent, which the editor keeps fixed");
});
