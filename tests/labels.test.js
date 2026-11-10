import { test } from "node:test";
import assert from "node:assert/strict";
import { agentLabel, numberRepeatedLabels } from "../public/js/engine/labels.js";
import { deriveInspector } from "../public/js/replay/inspect-model.js";

const design = { nodes: [{ id: "debater", agent: "debater" }, { id: "debater-2", agent: "debater" }, { id: "judge", agent: "judge" }, { id: "free", agent: "free", name: "Cook" }, { id: "free-2", agent: "free", name: "Cook" }] };

test("agents of the same type are numbered in design order, a single one is not", () => {
  assert.equal(agentLabel(design.nodes[0], design, "Debater"), "Debater 1");
  assert.equal(agentLabel(design.nodes[1], design, "Debater"), "Debater 2");
  assert.equal(agentLabel(design.nodes[2], design, "Judge"), "Judge");
});

test("a free agent keeps the name it was given", () => {
  assert.equal(agentLabel(design.nodes[3], design, "Free agent"), "Cook");
});

test("numberRepeatedLabels numbers only labels that repeat", () => {
  assert.deepEqual(numberRepeatedLabels(["Debater", "Judge", "Debater"]), ["Debater 1", "Judge", "Debater 2"]);
});

test("an older run with two agents both called Debater shows Debater 1 and Debater 2", () => {
  const events = [
    { t: 0, type: "run_start", task: "x" },
    { t: 1, type: "agent_start", agent: "debater", role: "Debater", model: "m", tools: [] },
    { t: 2, type: "agent_start", agent: "debater-2", role: "Debater", model: "m", tools: [] },
  ];
  const s = deriveInspector(events, 3);
  assert.deepEqual(s.order.map((id) => s.agents[id].label), ["Debater 1", "Debater 2"]);
});

test("a debater shows the name it was given and the others are numbered among themselves", () => {
  const d = { nodes: [{ id: "debater", agent: "debater", name: "Optimist" }, { id: "debater-2", agent: "debater" }, { id: "debater-3", agent: "debater", name: "  " }] };
  assert.equal(agentLabel(d.nodes[0], d, "Debater"), "Optimist");
  assert.equal(agentLabel(d.nodes[1], d, "Debater"), "Debater 1");
  assert.equal(agentLabel(d.nodes[2], d, "Debater"), "Debater 2");
});
