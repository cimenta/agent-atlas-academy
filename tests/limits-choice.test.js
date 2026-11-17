import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compareLimits, predictStop, labHref, withCurrentLimits } from "../public/js/replay/limits-compare.js";
import { parseRoute } from "../public/js/router.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));

const run = {
  id: "run-1",
  limits: { maxSteps: 20, maxTokens: 40000, maxSearches: 3 },
  events: [
    { type: "round", agent: "a", usage: { input: 900, output: 100 }, t: 6000 },
    { type: "round", agent: "b", usage: { input: 1500, output: 500 }, t: 20000 },
    { type: "round", agent: "c", usage: { input: 2000, output: 500 }, t: 40000 },
  ],
};

test("the two sets of limits are compared row by row", () => {
  const same = compareLimits(run.limits, run.limits);
  assert.equal(same.differs, false);
  const diff = compareLimits({ maxSteps: 5, maxTokens: 40000, maxSearches: 3 }, run.limits);
  assert.equal(diff.differs, true);
  assert.deepEqual(diff.rows.map((r) => r.differs), [true, false, false]);
  assert.deepEqual([diff.rows[0].now, diff.rows[0].had], [5, 20]);
});

test("a run that already recorded more steps than the new limit is predicted to stop", () => {
  const guess = predictStop(run, { maxSteps: 2, maxTokens: 40000, maxSearches: 3 });
  assert.deepEqual([guess.step, guess.reason, guess.recorded], [3, "steps", true]);
  assert.equal(predictStop(run, { maxSteps: 20, maxTokens: 40000, maxSearches: 3 }), null);
});

test("a run that fits exactly has no room for the agent that is retried", () => {
  const guess = predictStop(run, { maxSteps: 3, maxTokens: 40000, maxSearches: 3 });
  assert.deepEqual([guess.step, guess.reason, guess.recorded], [4, "steps", false]);
  const tokens = predictStop(run, { maxSteps: 20, maxTokens: 5500, maxSearches: 3 });
  assert.equal(tokens.reason, "tokens");
  assert.equal(predictStop({ events: [] }, { maxSteps: 1, maxTokens: 1000, maxSearches: 0 }), null);
});

test("retry with the limits of Settings replaces the limits of the record and keeps the rest", () => {
  const next = withCurrentLimits(run, { maxSteps: 7, maxTokens: 9000, maxSearches: 1 });
  assert.deepEqual(next.limits, { maxSteps: 7, maxTokens: 9000, maxSearches: 1 });
  assert.equal(next.id, "run-1");
  assert.equal(run.limits.maxSteps, 20, "the original is untouched");
});

test("the lab link carries the run and the limits, and the router reads them back", () => {
  const href = labHref(run, { maxSteps: 5, maxTokens: 12000, maxSearches: 3 }, 3);
  assert.equal(href, "#/learn/lab?run=run-1&steps=5&tokens=12000&repeat=3");
  assert.deepEqual(parseRoute(href), { name: "lab", params: { run: "run-1", steps: 5, tokens: 12000, repeat: 3 } });
  assert.deepEqual(parseRoute("#/learn/lab"), { name: "lab", params: {} });
  assert.deepEqual(parseRoute("#/learn/lab?run=../x&steps=abc"), { name: "lab", params: {} });
});

test("the limits row has texts in both languages", () => {
  for (const [lang, locale] of [["en", en], ["cs", cs]]) {
    for (const k of ["limits.useCurrent", "limits.details", "limits.hide", "limits.now", "limits.had", "limits.steps", "limits.tokens", "limits.searches", "limits.differs", "limits.explain", "limits.same", "limits.predict", "limits.tryLab", "lab.yourRun"]) assert.ok(locale[k], `${lang} ${k}`);
  }
  assert.equal(en["limits.useCurrent"], "Use current limits from Settings");
});

test("Create keeps limits you typed and reloads the others from Settings", () => {
  const source = read("../public/js/create/create-page.js");
  assert.match(source, /draft\.limits === null \|\| !draft\.limitsEdited/);
  assert.match(source, /draft\.limitsEdited = true/);
});

test("the Harness lab page and its address handling load without a syntax error", async () => {
  const lab = await import("../public/js/harness-lab.js");
  assert.equal(typeof lab.renderLab, "function");
});

test("Use in Create fills the task and design and drops limits changed by hand for an earlier run", async () => {
  const { draft, openInCreate } = await import("../public/js/create/draft.js");
  const { definitionFromRun } = await import("../public/js/create/definition.js");
  const definition = definitionFromRun(JSON.parse(read("../public/runs/sequential-simple.json")));
  draft.limits = { maxSteps: 7, maxTokens: 9000, maxSearches: 1 };
  draft.limitsEdited = true;
  const doc = { defaultView: { confirm: () => true, location: { hash: "" } } };
  const ok = openInCreate(doc, (k) => k, definition);
  assert.equal(ok, true);
  assert.equal(draft.limits, null);
  assert.equal(draft.limitsEdited, false);
  assert.equal(doc.defaultView.location.hash, "#/play/create");
});

test("a failed load of the definition keeps the limits changed by hand", async () => {
  const { draft, openInCreate } = await import("../public/js/create/draft.js");
  draft.limits = { maxSteps: 7, maxTokens: 9000, maxSearches: 1 };
  draft.limitsEdited = true;
  const doc = { defaultView: { confirm: () => true, location: { hash: "" } } };
  assert.equal(openInCreate(doc, (k) => k, { nonsense: true }), false);
  assert.equal(draft.limitsEdited, true);
  assert.equal(draft.limits.maxSteps, 7);
});
