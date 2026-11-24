import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { labSteps, labTotals, labRanges, simulate } from "../public/js/harness-lab-model.js";
import { parseRoute } from "../public/js/router.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));

const run = {
  events: [
    { type: "round", agent: "a", usage: { input: 900, output: 100 }, t: 6000 },
    { type: "agent_output", agent: "a", text: "Plan", t: 6100 },
    { type: "round", agent: "b", usage: { input: 1500, output: 500 }, t: 20000 },
    { type: "round", agent: "b", usage: { input: 2000, output: 500 }, t: 40000 },
    { type: "agent_output", agent: "b", text: "Done", t: 40100 },
  ],
};
const open = { maxSteps: 10, maxTokens: 100000, timeSec: 270, repeatStop: 0 };

test("the model calls of a run become steps with tokens, time and the answer of the last call of an agent", () => {
  const steps = labSteps(run);
  assert.deepEqual(steps.map((s) => [s.agent, s.tokens, s.ms, s.answer]), [["a", 1000, 6000, "Plan"], ["b", 2000, 20000, null], ["b", 2500, 40000, "Done"]]);
  assert.deepEqual(labTotals(steps), { steps: 3, tokens: 5500, sec: 40 });
});

test("with room to spare the run finishes", () => {
  const result = simulate(labSteps(run), open);
  assert.equal(result.finished, true);
  assert.deepEqual(result.rows, ["done", "done", "done"]);
});

test("the step limit refuses the step that would pass it", () => {
  const result = simulate(labSteps(run), { ...open, maxSteps: 2 });
  assert.deepEqual(result.stop, { index: 2, reason: "steps", value: 2 });
  assert.deepEqual(result.rows, ["done", "done", "stop"]);
  assert.equal(result.used.steps, 2);
});

test("the token limit stops after the step that passed it, and later steps are not taken", () => {
  const result = simulate(labSteps(run), { ...open, maxTokens: 2500 });
  assert.equal(result.stop.reason, "tokens");
  assert.equal(result.stop.index, 1);
  assert.deepEqual(result.rows, ["done", "stop", "after"]);
});

test("the time limit stops the run at the step that reaches it", () => {
  const result = simulate(labSteps(run), { ...open, timeSec: 20 });
  assert.equal(result.stop.reason, "time");
  assert.equal(result.stop.index, 1);
});

test("repeated answers of one agent stop the run", () => {
  const same = { events: [0, 1, 2].flatMap((i) => [{ type: "round", agent: "w", usage: { input: 10, output: 10 }, t: 1000 * (i + 1) }, { type: "agent_output", agent: "w", text: "  The SAME answer ", t: 1000 * (i + 1) }]) };
  const result = simulate(labSteps(same), { ...open, repeatStop: 3 });
  assert.deepEqual(result.stop, { index: 2, reason: "repeat", value: 3 });
  assert.equal(simulate(labSteps(same), open).finished, true);
});

test("the slider ranges leave room above what the run used", () => {
  const ranges = labRanges(labSteps(run));
  assert.ok(ranges.steps.max >= 3 && ranges.tokens.max >= 5500 && ranges.time.max >= 40 && ranges.time.max <= 270);
});

test("every recorded run of the library can be played in the lab", () => {
  const dir = new URL("../public/runs/", import.meta.url);
  const ids = readdirSync(dir).filter((f) => /^[a-z-]+\.json$/.test(f) && f !== "index.json");
  assert.ok(ids.length >= 4);
  for (const f of ids) {
    const steps = labSteps(JSON.parse(readFileSync(new URL(f, dir), "utf8")));
    assert.ok(steps.length > 0, f);
    const ranges = labRanges(steps);
    assert.equal(simulate(steps, { maxSteps: ranges.steps.max, maxTokens: ranges.tokens.max, timeSec: ranges.time.max, repeatStop: 0 }).finished, true, f);
  }
});

test("the lab has a route and its texts in both languages", () => {
  assert.deepEqual(parseRoute("#/learn/lab"), { name: "lab", params: {} });
  assert.equal(parseRoute("#/learn/harness").name, "article");
  for (const [lang, locale] of [["en", en], ["cs", cs]]) {
    for (const k of ["lab.title", "lab.intro", "lab.run", "lab.runInfo", "lab.setLimits", "lab.seeStop", "lab.steps", "lab.tokens", "lab.time", "lab.repeat", "lab.repeatOff", "lab.repeatTimes", "learn.labSummary", "learn.labTag", "lab.note", "lab.fromSettings", "lab.stepTokens", "lab.stepTime", "lab.finished", "lab.stopped", "lab.why.steps", "lab.why.tokens", "lab.why.time", "lab.why.repeat", "lab.use", "lab.used", "lab.reset", "lab.goal", "lab.loadFailed", "lab.openLink"]) assert.ok(locale[k], `${lang} ${k}`);
  }
});
