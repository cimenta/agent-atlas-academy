import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { createMockCall } from "../public/js/engine/mock-anthropic.js";
import { buildStatistics } from "../public/js/play-model.js";
import { differences } from "../public/js/compare-model.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const design = (max) => ({
  pattern: "supervisor",
  nodes: [node("boss", "supervisor", max ? { creates: { max, guidance: "", search: false } } : {}), node("researcher", "researcher")],
  edges: [{ from: "boss", to: "researcher" }],
});
async function record(d) {
  const events = [];
  await runDesign({ design: d, task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  return { id: "r", design: d, events, task: "Explain it", recordedWith: { provider: "anthropic" } };
}
const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

test("the statistics list the created agents with what each used and cost", async () => {
  const stats = buildStatistics(await record(design(2)));
  assert.equal(stats.created.length, 1);
  const c = stats.created[0];
  assert.equal(c.id, "made-1");
  assert.equal(c.name, "Fact checker");
  assert.equal(c.by, "boss");
  assert.ok(c.step >= 1);
  assert.ok(c.calls >= 1);
  assert.ok(c.input > 0 && c.output > 0);
  assert.ok(c.cost > 0);
  assert.ok(stats.perAgent.some((a) => a.agent === "made-1"));
});

test("a run without created agents has an empty list", async () => {
  const stats = buildStatistics(await record(design(0)));
  assert.deepEqual(stats.created, []);
});

test("Compare shows how many agents a run created and how many it could", async () => {
  const none = await record(design(0));
  const some = await record(design(3));
  const rows = differences([none, some]).rows;
  const created = rows.find((r) => r.id === "created");
  const allowed = rows.find((r) => r.id === "createsMax");
  assert.deepEqual(created.values, [null, 1]);
  assert.deepEqual(allowed.values, [null, 3]);
  assert.equal(differences([some, some]).rows.some((r) => r.id === "created" || r.id === "createsMax"), false);
});

test("the texts of Statistics and Compare exist in both languages", () => {
  const keys = ["stats.created.heading", "stats.created.agent", "stats.created.by", "stats.created.at", "stats.created.calls", "stats.created.tokens", "stats.created.cost", "compare.k.created", "compare.k.createsMax"];
  for (const k of keys) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
    assert.notEqual(cs[k], en[k], `cs ${k} is not translated`);
  }
});
