import test from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "../public/js/create/editor-model.js";
import { loadDefinition, buildDefinition } from "../public/js/create/definition.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";
import { activationsOf } from "../public/js/engine/estimate.js";

const node = (id, agent, extra = {}) => ({ id, agent, model: "fast", search: false, ...extra });
const FMT = { fields: [{ name: "title", type: "text" }] };

test("validateDesign: a format only where an agent may have one", () => {
  const ok = { pattern: "sequential", nodes: [node("writer", "writer", { format: FMT })], edges: [] };
  assert.equal(validateDesign(ok).ok, true);
  const bad = { pattern: "supervisor", nodes: [node("supervisor", "supervisor", { format: FMT }), node("writer", "writer")], edges: [{ from: "supervisor", to: "writer" }] };
  assert.ok(validateDesign(bad).errors.some((e) => e.code === "node.format"));
  const six = { pattern: "sequential", nodes: [node("writer", "writer", { format: { fields: Array.from({ length: 6 }, (_, i) => ({ name: `f${i}`, type: "text" })) } })], edges: [] };
  assert.ok(validateDesign(six).errors.some((e) => e.code === "node.format"));
});

test("editor keeps a cleaned format and removes it on null", () => {
  const e = createEditor("sequential");
  const id = e.addNode("writer").id;
  e.setNode(id, { format: { fields: [{ name: " title ", type: "text" }] } });
  assert.deepEqual(e.design().nodes.find((n) => n.id === id).format, { fields: [{ name: "title", type: "text" }] });
  e.setNode(id, { format: null });
  assert.equal("format" in e.design().nodes.find((n) => n.id === id), false);
});

test("a format on an agent that may not have one is not kept", () => {
  const e = createEditor("supervisor");
  const boss = e.addNode("supervisor", { format: FMT }).id;
  assert.equal("format" in e.design().nodes.find((n) => n.id === boss), false);
  const h = createEditor("handoff");
  const a = h.addNode("writer", { format: FMT }).id;
  assert.equal("format" in h.design().nodes.find((n) => n.id === a), false);
});

test("a definition keeps a valid format and drops one that is not valid", () => {
  const e = createEditor("sequential");
  const id = e.addNode("writer").id;
  e.setNode(id, { format: FMT });
  const loaded = loadDefinition(JSON.stringify(buildDefinition({ task: "x", design: e.design() })));
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.editor.design().nodes[0].format, FMT);
  const raw = buildDefinition({ task: "x", design: e.design() });
  raw.design.nodes[0].format = { fields: [{ name: "!!", type: "date" }] };
  const again = loadDefinition(JSON.stringify(raw));
  assert.equal(again.ok, true);
  assert.equal("format" in again.editor.design().nodes[0], false);
});

test("the system prompt carries the format only for an agent that may have one", () => {
  const w = systemPromptFor(node("writer", "writer", { format: FMT }), { pattern: "sequential" });
  assert.ok(w.includes('The fields:\n"title": text'));
  assert.ok(!systemPromptFor(node("writer", "writer"), { pattern: "sequential" }).includes("The fields:"));
  assert.ok(!systemPromptFor(node("supervisor", "supervisor", { format: FMT }), { pattern: "supervisor" }).includes("The fields:"));
});

test("the estimate counts one more call for each agent with a format", () => {
  const plain = { pattern: "sequential", nodes: [node("researcher", "researcher"), node("writer", "writer")], edges: [{ from: "researcher", to: "writer" }] };
  const withFormat = structuredClone(plain);
  withFormat.nodes[1].format = FMT;
  assert.equal(activationsOf(withFormat, {}), activationsOf(plain, {}) + 1);
});
