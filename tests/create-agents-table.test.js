import test from "node:test";
import assert from "node:assert/strict";
import { agentRows } from "../public/js/create/create-model.js";
import { createEditor } from "../public/js/create/editor-model.js";
import { providerCatalog } from "../public/js/engine/catalog.js";
import { slotProvider, slotIsFree } from "../public/js/key-slots.js";
import { draft, openInCreate } from "../public/js/create/draft.js";
import { definitionFromRun } from "../public/js/create/definition.js";
import { readFileSync } from "node:fs";

const modelInfo = (slot, key) => {
  const m = providerCatalog(slotProvider(slot)).models.find((x) => x.key === key);
  return { label: m?.label ?? key, id: m?.id ?? key };
};
const names = { anthropic: "Anthropic", "google-free": "Gemini free", google: "Gemini paid" };
const rowsOf = (design) => agentRows({ design, slotName: (s) => names[s], slotIsFree, modelInfo, fallbackSlot: "anthropic" });
const design = () => {
  const e = createEditor("sequential");
  e.setDefaultModel({ slot: "anthropic", model: "fast" });
  const a = e.addNode("planner").id;
  const b = e.addNode("researcher").id;
  const c = e.addNode("writer").id;
  e.setNodeModel(c, { slot: "google-free", model: "balanced" });
  return { design: e.design(), ids: [a, b, c] };
};

test("a row shows the label of the agent, its provider and the real model id", () => {
  const { design: d, ids } = design();
  const rows = rowsOf(d);
  assert.deepEqual(rows.map((r) => r.id), ids);
  assert.equal(rows[0].label, "Planner");
  assert.equal(rows[0].provider, "Anthropic");
  assert.equal(rows[0].modelId, "claude-haiku-5-5");
  assert.equal(rows[0].modelLabel, "Fast");
  assert.equal(rows[2].provider, "Gemini free");
  assert.equal(rows[2].modelId, "gemini-3.8-flash");
});

test("an Anthropic agent is paid and an agent on a free Gemini key is not", () => {
  const rows = rowsOf(design().design);
  assert.deepEqual(rows.map((r) => r.paid), [true, true, false]);
});

test("search is true only for an agent that has it on", () => {
  const rows = rowsOf(design().design);
  assert.deepEqual(rows.map((r) => r.search), [false, true, false]);
});

test("an agent with a name of its own shows that name, and an agent without a slot uses the fallback", () => {
  const { design: d } = design();
  d.nodes[0].name = "Chief planner";
  delete d.nodes[1].slot;
  const rows = rowsOf(d);
  assert.equal(rows[0].label, "Chief planner");
  assert.equal(rows[1].provider, "Anthropic");
});

test("an agent whose model was chosen by the student is marked as its own", () => {
  const rows = rowsOf(design().design);
  assert.deepEqual(rows.map((r) => r.custom), [false, false, true]);
});

// ---- the limits are decided by the student ----
test("Use in Create drops the decisions about the limits together with the limits themselves", () => {
  draft.decisions.limits.maxSteps = false;
  draft.limitsEdited = true;
  const doc = { defaultView: { location: { hash: "" }, confirm: () => true } };
  const run = JSON.parse(readFileSync(new URL("../public/runs/sequential-simple.json", import.meta.url), "utf8"));
  assert.equal(openInCreate(doc, (k) => k, definitionFromRun(run)), true);
  assert.equal(draft.decisions.limits.maxSteps, true);
  assert.equal(draft.limitsEdited, false);
});
