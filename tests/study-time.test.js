import { test } from "node:test";
import assert from "node:assert/strict";
import { STUDY, countWords, newWords, studyTime } from "../public/js/study-time.js";

const base = { patternText: "One after another, each passes its result on.", agents: 3, taskText: "Explain the moon", outputs: ["a b c d e", "f g h i j"], notes: ["A note of five words here."], sections: ["one two three"], runSeconds: 30, apiCalls: 3 };

test("countWords counts words and treats an empty or missing text as none", () => {
  assert.equal(countWords("  two  words "), 2);
  assert.equal(countWords(""), 0);
  assert.equal(countWords(undefined), 0);
});

test("newWords: a text that repeats the one before costs the repeated share, new text costs in full", () => {
  assert.equal(newWords(["alpha beta gamma delta"]), 4);
  const text = "alpha beta gamma delta epsilon zeta eta theta iota kappa";
  assert.ok(Math.abs(newWords([text, text]) - (10 + 10 * STUDY.repeatedShare)) < 1e-9);
  assert.equal(newWords(["", "x y"]), 2);
});

test("the study time grows with every part: more agents, more text, more calls", () => {
  const t0 = studyTime({ ...base, runSeconds: 0 }).total;
  const more = (over) => studyTime({ ...base, runSeconds: 0, ...over }).total;
  assert.ok(more({ agents: 4 }) > t0);
  assert.ok(more({ sections: [...base.sections, "more words in a new section"] }) > t0);
  assert.ok(more({ apiCalls: 6 }) > t0);
  assert.ok(more({ outputs: [...base.outputs, "k l m n o p q r s t"] }) > t0);
});

test("a long log is read in samples, the replay is never shorter than the run, and the result is never under the minimum", () => {
  assert.equal(studyTime({ ...base, apiCalls: 50 }).total, studyTime({ ...base, apiCalls: STUDY.apiCallsMax }).total);
  const r = studyTime({ ...base, runSeconds: 600 });
  assert.ok(r.seconds.replay >= 600 * STUDY.passes);
  assert.equal(studyTime({ agents: 0 }).minutes, STUDY.minMinutes);
});

test("the parts add up to the total with the slack", () => {
  const { seconds, total } = studyTime(base);
  assert.ok(Math.abs(seconds.pattern + seconds.texts + seconds.replay + seconds.tabs + seconds.slack - total) < 1e-9);
});
