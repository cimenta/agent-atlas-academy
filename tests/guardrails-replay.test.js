import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { REVIEWER_SYSTEM } from "../public/js/engine/guardrails.js";
import { deriveInspector } from "../public/js/replay/inspect-model.js";
import { buildStatistics } from "../public/js/play-model.js";
import { differences } from "../public/js/compare-model.js";
import { activationsOf } from "../public/js/engine/estimate.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));
const KEY = "sk-ant-api03-" + "A".repeat(20);
const SECRET = { where: "output", kind: "secret", onFail: "repair" };
const REVIEWER = { where: "output", kind: "reviewer", onFail: "stop", policy: "No medical advice.", model: "fast" };
const design = (guardrails) => ({ pattern: "sequential", nodes: [{ id: "writer", agent: "writer", name: "Writer", model: "fast", search: false, ...(guardrails ? { guardrails } : {}) }], edges: [] });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 400, output_tokens: 20 } });
async function record(replies, d = design([SECRET]), reviews = []) {
  const events = [];
  const call = async (body) => text(body.system === REVIEWER_SYSTEM ? reviews.shift() : replies.shift());
  await runDesign({ design: d, task: "T", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  return { id: "r", design: d, events, task: "T", pattern: "sequential", recordedWith: { provider: "anthropic" } };
}
const steps = (run) => deriveInspector(run.events).agents.writer.steps.filter((s) => s.kind === "check" && s.tool === "guardrail");

test("the inspector shows a step for each guardrail check: a cross, the repair, then a tick", async () => {
  const run = await record([KEY, "clean"]);
  const s = steps(run);
  assert.deepEqual(s.map((x) => x.title.key), ["insp.guardrailRepair", "insp.guardrailRepairAsked", "insp.guardrailPassed"]);
  assert.deepEqual(s.map((x) => x.ok), [false, true, true]);
  assert.equal(s[0].title.params.n, 1);
  assert.match(s[0].input, /looks like a secret/);
  assert.equal(s[0].output, KEY);
});

test("a stopped guardrail marks the agent as failed, a noted one does not", async () => {
  const stopped = await record([KEY], design([{ ...SECRET, onFail: "stop" }]));
  assert.equal(steps(stopped)[0].title.key, "insp.guardrailStopped");
  assert.equal(deriveInspector(stopped.events).agents.writer.status, "error");
  const noted = await record([KEY], design([{ ...SECRET, onFail: "flag" }]));
  assert.equal(steps(noted)[0].title.key, "insp.guardrailNoted");
  assert.equal(steps(noted)[0].action, "noted");
  assert.notEqual(deriveInspector(noted.events).agents.writer.status, "error");
});

test("a reviewer step carries its tokens, cost and model", async () => {
  const run = await record(["Fine"], design([REVIEWER]), ['{"verdict":"pass","reason":"ok"}']);
  const s = steps(run)[0];
  assert.deepEqual(s.reviewer.tokens, { input: 400, output: 20 });
  assert.equal(s.reviewer.model, "claude-haiku-5-5");
  assert.ok(s.reviewer.cost > 0);
});

test("statistics count the hits, and the reviewer's tokens are in the cost", async () => {
  assert.equal(buildStatistics(await record([KEY, "clean"])).guardrailHits, 1);
  assert.equal(buildStatistics(await record(["clean"])).guardrailHits, 0);
  const plain = await record(["hello"], design(null));
  const withReviewer = await record(["hello"], design([REVIEWER]), ['{"verdict":"pass","reason":""}']);
  assert.ok(buildStatistics(withReviewer).cost > buildStatistics(plain).cost);
});

test("the result page has a tile that appears only when above zero", () => {
  assert.match(read("../public/js/result-page.js"), /stats\.guardrailHits > 0 \? \[tile\(num\(stats\.guardrailHits\), t\("stats\.guardrailHits"\)\)\]/);
});

test("compare has the rows Agents with guardrails and Guardrail hits", async () => {
  const a = await record(["hello"], design(null));
  const b = await record([KEY, "clean"]);
  const rows = differences([a, b]).rows;
  assert.deepEqual(rows.find((r) => r.id === "guardrailAgents").values, [null, 1]);
  assert.deepEqual(rows.find((r) => r.id === "guardrailHits").values, [null, 1]);
  assert.equal(differences([b, b]).rows.some((r) => r.id.startsWith("guardrail")), false);
});

test("the estimate counts a call for each reviewer and one for an agent that may be repaired", () => {
  const base = activationsOf(design(null), {});
  assert.equal(activationsOf(design([REVIEWER]), {}), base + 1);
  assert.equal(activationsOf(design([SECRET]), {}), base + 1);
  assert.equal(activationsOf(design([{ ...SECRET, onFail: "flag" }]), {}), base);
  assert.equal(activationsOf(design([{ ...REVIEWER, onFail: "repair" }, SECRET]), {}), base + 2);
});

test("the step detail translates the parameters of a title and has its own explanation", () => {
  const source = read("../public/js/replay/step-detail.js");
  assert.match(source, /typeof v.key === "string"/);
  assert.match(source, /insp.doc.guardrail/);
});

test("the texts exist in both languages and the replay marks a noted guardrail", () => {
  for (const k of ["insp.guardrailPassed", "insp.guardrailNoted", "insp.guardrailRepair", "insp.guardrailStopped", "insp.guardrailRepairAsked", "insp.doc.guardrail", "insp.guardrailReviewer", "insp.guardrail.where.output", "insp.guardrail.where.input", "stats.guardrailHits", "compare.k.guardrailAgents", "compare.k.guardrailHits"]) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
    assert.notEqual(cs[k], en[k], `cs ${k} is not translated`);
  }
  assert.match(read("../public/js/replay/run-steps-view.js"), /check-note/);
});

test("two repair guardrails that fail on one answer show one repair step", async () => {
  const run = await record([`${KEY} ${"x".repeat(60)}`, "clean"], design([SECRET, { where: "output", kind: "length", onFail: "repair", max: 50 }]));
  assert.equal(steps(run).filter((x) => x.title.key === "insp.guardrailRepairAsked").length, 1);
});
