import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { deriveInspector } from "../public/js/replay/inspect-model.js";
import { buildStatistics } from "../public/js/play-model.js";
import { differences } from "../public/js/compare-model.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));
const FMT = { fields: [{ name: "title", type: "text" }, { name: "n", type: "number" }] };
const design = (format = FMT) => ({ pattern: "sequential", nodes: [{ id: "writer", agent: "writer", name: "Writer", model: "fast", search: false, ...(format ? { format } : {}) }], edges: [] });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
async function record(replies, d = design()) {
  const events = [];
  await runDesign({ design: d, task: "T", limits: LIMIT_DEFAULTS, call: async () => text(replies.shift()), emit: (e) => events.push(e) });
  return { id: "r", design: d, events, task: "T", pattern: "sequential", recordedWith: { provider: "anthropic" } };
}

test("the inspector shows a check step for each try: a cross with the problems, then a tick", async () => {
  const { events } = await record(["no", '{"title":"A","n":3}']);
  const steps = deriveInspector(events).agents.writer.steps.filter((s) => s.kind === "check");
  assert.equal(steps.length, 3);
  assert.deepEqual(steps.filter((s) => s.title.key !== "insp.formatRepairAsked").map((s) => [s.ok, s.attempt, s.title.key]), [[false, 1, "insp.formatFailed"], [true, 2, "insp.formatOkRepaired"]]);
  assert.equal(steps[0].input, "the reply is not one JSON object");
});

test("statistics count the repairs and the agents with a format", async () => {
  const repaired = await record(["no", '{"title":"A","n":3}']);
  assert.equal(buildStatistics(repaired).formatRepairs, 1);
  const clean = await record(['{"title":"A","n":3}']);
  assert.equal(buildStatistics(clean).formatRepairs, 0);
  const plain = await record(["hello"], design(null));
  assert.equal(buildStatistics(plain).formatRepairs, 0);
});

test("the result page has a tile that appears only when above zero", () => {
  const source = read("../public/js/result-page.js");
  assert.match(source, /stats\.formatRepairs > 0 \? \[tile\(num\(stats\.formatRepairs\), t\("stats\.formatRepairs"\)\)\]/);
});

test("compare has the rows Agents with a format and Format repairs", async () => {
  const a = await record(["hello"], design(null));
  const b = await record(["no", '{"title":"A","n":3}']);
  const rows = differences([a, b]).rows;
  assert.deepEqual(rows.find((r) => r.id === "formatAgents").values, [null, 1]);
  assert.deepEqual(rows.find((r) => r.id === "formatRepairs").values, [null, 1]);
  assert.equal(differences([b, b]).rows.some((r) => r.id.startsWith("format")), false);
});

test("the texts exist in both languages and the replay marks a check step", () => {
  for (const k of ["insp.formatOk", "insp.formatOkRepaired", "insp.formatRepairAsked", "insp.doc.check", "insp.formatFailed", "kind.check", "stats.formatRepairs", "compare.k.formatAgents", "compare.k.formatRepairs"]) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
    assert.notEqual(cs[k], en[k], `cs ${k} is not translated`);
  }
  assert.match(read("../public/js/replay/view.js"), /check-ok/);
  assert.match(read("../public/js/replay/view.js"), /check: "kind\.check"/);
});
