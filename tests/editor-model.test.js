import { test } from "node:test";
import assert from "node:assert/strict";
import { createEditor, layoutDesign } from "../public/js/create/editor-model.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { NODE_MAX } from "../public/js/engine/catalog.js";

const add = (editor, agent) => {
  const result = editor.addNode(agent);
  assert.equal(result.ok, true, `${agent} should be added: ${JSON.stringify(result)}`);
  return result.id;
};

test("the same agent type can be added twice and gets distinct ids", () => {
  const editor = createEditor("sequential");
  assert.equal(add(editor, "critic"), "critic");
  assert.equal(add(editor, "critic"), "critic-2");
  assert.equal(add(editor, "critic"), "critic-3");
});

test("new nodes get the default model and the agent's search default", () => {
  const editor = createEditor("sequential");
  add(editor, "researcher");
  add(editor, "writer");
  const [researcher, writer] = editor.design().nodes;
  assert.equal(researcher.model, "fast");
  assert.equal(researcher.search, true);
  assert.equal(writer.search, false);
});

test("an agent that does not belong to the pattern is refused", () => {
  const editor = createEditor("sequential");
  assert.deepEqual(editor.addNode("combiner"), { ok: false, code: "node.agentNotAllowed" });
  assert.deepEqual(editor.addNode("nonsense"), { ok: false, code: "node.agent" });
});

test("supervisor, combiner and judge can only be added once, free agents as often as needed", () => {
  const sup = createEditor("supervisor");
  add(sup, "supervisor");
  assert.deepEqual(sup.addNode("supervisor"), { ok: false, code: "node.duplicate" });
  const par = createEditor("parallel");
  add(par, "combiner");
  assert.deepEqual(par.addNode("combiner"), { ok: false, code: "node.duplicate" });
  const deb = createEditor("debate");
  add(deb, "judge");
  assert.deepEqual(deb.addNode("judge"), { ok: false, code: "node.duplicate" });
  const seq = createEditor("sequential");
  const first = add(seq, "free");
  const second = add(seq, "free");
  assert.notEqual(first, second);
  assert.equal(seq.design().nodes.filter((n) => n.agent === "free").length, 2);
});

test("the free agent starts with an empty name and instructions", () => {
  const editor = createEditor("sequential");
  add(editor, "free");
  const node = editor.design().nodes[0];
  assert.equal(node.name, "");
  assert.equal(node.instructions, "");
});

test("the ninth node is refused", () => {
  const editor = createEditor("sequential");
  for (let i = 0; i < NODE_MAX; i++) add(editor, "writer");
  assert.deepEqual(editor.addNode("writer"), { ok: false, code: "node.count" });
});

test("sequential connections: a second outgoing or incoming edge and a cycle are refused", () => {
  const editor = createEditor("sequential");
  const a = add(editor, "planner");
  const b = add(editor, "writer");
  const c = add(editor, "critic");
  assert.deepEqual(editor.connect(a, b), { ok: true });
  assert.deepEqual(editor.connect(a, c), { ok: false, code: "seq.notChain" });
  assert.deepEqual(editor.connect(c, b), { ok: false, code: "seq.notChain" });
  assert.deepEqual(editor.connect(b, c), { ok: true });
  assert.deepEqual(editor.connect(c, a), { ok: false, code: "seq.notChain" });
});

test("self, duplicate and unknown connections are refused", () => {
  const editor = createEditor("sequential");
  const a = add(editor, "planner");
  const b = add(editor, "writer");
  assert.deepEqual(editor.connect(a, a), { ok: false, code: "edge.self" });
  editor.connect(a, b);
  assert.deepEqual(editor.connect(a, b), { ok: false, code: "edge.duplicate" });
  assert.deepEqual(editor.connect(a, "ghost"), { ok: false, code: "edge.unknownNode" });
});

test("hub patterns accept only spoke-to-hub edges, in the right direction", () => {
  const sup = createEditor("supervisor");
  const boss = add(sup, "supervisor");
  const w1 = add(sup, "researcher");
  const w2 = add(sup, "writer");
  assert.deepEqual(sup.connect(w1, w2), { ok: false, code: "sup.edges" });
  assert.deepEqual(sup.connect(w1, boss), { ok: false, code: "sup.edges" });
  assert.deepEqual(sup.connect(boss, w1), { ok: true });

  const deb = createEditor("debate");
  const d1 = add(deb, "debater");
  const d2 = add(deb, "debater");
  const judge = add(deb, "judge");
  assert.deepEqual(deb.connect(d1, d2), { ok: false, code: "deb.edges" });
  assert.deepEqual(deb.connect(judge, d1), { ok: false, code: "deb.edges" });
  assert.deepEqual(deb.connect(d1, judge), { ok: true });

  const par = createEditor("parallel");
  const p1 = add(par, "researcher");
  const p2 = add(par, "researcher");
  const comb = add(par, "combiner");
  assert.deepEqual(par.connect(p1, p2), { ok: false, code: "par.edges" });
  assert.deepEqual(par.connect(p1, comb), { ok: true });
  assert.deepEqual(par.connect(comb, p1), { ok: false, code: "par.edges" }, "a worker cannot also follow the combiner");
  assert.deepEqual(par.connect(p2, comb), { ok: true });

  // After the combiner a line of agents may follow, one at a time.
  const critic = add(par, "critic");
  const writer = add(par, "writer");
  assert.deepEqual(par.connect(writer, critic), { ok: false, code: "par.edges" });
  assert.deepEqual(par.connect(comb, critic), { ok: true });
  assert.deepEqual(par.connect(comb, writer), { ok: false, code: "par.edges" }, "the line continues from its last agent");
  assert.deepEqual(par.connect(critic, comb), { ok: false, code: "par.edges" });
  assert.deepEqual(par.connect(critic, writer), { ok: true });
  assert.deepEqual(par.errors(), []);
  assert.deepEqual(layoutDesign(par.design()).nodes.find((n) => n.id === writer).y, 3);
});

test("each pattern can be built into a design that passes validateDesign", () => {
  const seq = createEditor("sequential");
  const [a, b, c] = ["planner", "researcher", "writer"].map((x) => add(seq, x));
  seq.connect(a, b);
  seq.connect(b, c);

  const par = createEditor("parallel");
  const [w1, w2, comb] = ["researcher", "researcher", "combiner"].map((x) => add(par, x));
  par.connect(w1, comb);
  par.connect(w2, comb);

  const sup = createEditor("supervisor");
  const [boss, s1] = ["supervisor", "writer"].map((x) => add(sup, x));
  sup.connect(boss, s1);

  const deb = createEditor("debate");
  const [d1, d2, judge] = ["debater", "debater", "judge"].map((x) => add(deb, x));
  deb.connect(d1, judge);
  deb.connect(d2, judge);
  deb.setRounds(3);

  for (const editor of [seq, par, sup, deb]) {
    assert.deepEqual(editor.errors(), []);
    assert.equal(validateDesign(editor.design()).ok, true);
  }
  assert.equal(deb.design().rounds, 3);
  assert.equal(seq.design().rounds, undefined);
});

test("errors() explains why an unfinished design cannot run", () => {
  const editor = createEditor("sequential");
  add(editor, "planner");
  add(editor, "writer");
  assert.ok(editor.errors().some((e) => e.code === "seq.notChain"));
});

test("removing a node removes its edges", () => {
  const editor = createEditor("sequential");
  const a = add(editor, "planner");
  const b = add(editor, "writer");
  editor.connect(a, b);
  editor.removeNode(a);
  assert.deepEqual(editor.design().edges, []);
  assert.deepEqual(editor.design().nodes.map((n) => n.id), [b]);
});

test("disconnect removes one edge", () => {
  const editor = createEditor("sequential");
  const a = add(editor, "planner");
  const b = add(editor, "writer");
  editor.connect(a, b);
  editor.disconnect(a, b);
  assert.deepEqual(editor.design().edges, []);
});

test("setNode changes only the editable fields", () => {
  const editor = createEditor("debate");
  const id = add(editor, "debater");
  editor.setNode(id, { model: "strong", search: true, stance: "for", agent: "judge", id: "hacked" });
  const node = editor.design().nodes[0];
  assert.equal(node.model, "strong");
  assert.equal(node.search, true);
  assert.equal(node.stance, "for");
  assert.equal(node.agent, "debater");
  assert.equal(node.id, id);
});

test("design() returns a copy that cannot change the editor", () => {
  const editor = createEditor("sequential");
  add(editor, "planner");
  const copy = editor.design();
  copy.nodes[0].model = "strong";
  copy.nodes.push({ id: "x" });
  assert.equal(editor.design().nodes[0].model, "fast");
  assert.equal(editor.design().nodes.length, 1);
});

test("paletteFor marks agents as allowed per pattern and once-only agents as taken", () => {
  const editor = createEditor("supervisor");
  const before = editor.paletteFor();
  const find = (agent) => before.find((p) => p.agent === agent);
  assert.equal(find("supervisor").allowed, true);
  assert.equal(find("combiner").allowed, false);
  assert.equal(find("debater").allowed, false);
  assert.equal(find("writer").allowed, true);
  assert.ok(find("writer").label);
  add(editor, "supervisor");
  assert.equal(editor.paletteFor().find((p) => p.agent === "supervisor").allowed, false);
});

test("reset clears nodes and edges and changes the pattern", () => {
  const editor = createEditor("sequential");
  const a = add(editor, "planner");
  const b = add(editor, "writer");
  editor.connect(a, b);
  editor.reset("debate");
  const design = editor.design();
  assert.equal(design.pattern, "debate");
  assert.deepEqual(design.nodes, []);
  assert.deepEqual(design.edges, []);
  assert.equal(design.rounds, 2);
});

function chain(...ids) {
  return {
    pattern: "sequential",
    nodes: ids.map((id) => ({ id, agent: "writer", model: "fast", search: false })),
    edges: ids.slice(1).map((id, i) => ({ from: ids[i], to: id })),
  };
}

test("layoutDesign is deterministic and gives every node its own spot", () => {
  const design = chain("a", "b", "c", "d");
  const first = layoutDesign(design, {});
  assert.deepEqual(layoutDesign(design, {}), first);
  const spots = new Set(first.nodes.map((n) => `${n.x},${n.y}`));
  assert.equal(spots.size, 4);
  for (const n of first.nodes) {
    assert.ok(Number.isInteger(n.x) && Number.isInteger(n.y));
  }
  assert.ok(first.width >= 1 && first.height >= 4);
});

test("a sequential chain goes top to bottom, or left to right when horizontal", () => {
  const design = chain("a", "b", "c");
  const v = layoutDesign(design, { orientation: "vertical" });
  const ys = ["a", "b", "c"].map((id) => v.nodes.find((n) => n.id === id).y);
  assert.ok(ys[0] < ys[1] && ys[1] < ys[2]);
  const hz = layoutDesign(design, { orientation: "horizontal" });
  const xs = ["a", "b", "c"].map((id) => hz.nodes.find((n) => n.id === id).x);
  assert.ok(xs[0] < xs[1] && xs[1] < xs[2]);
});

test("unconnected nodes are staged below the placed ones", () => {
  const design = chain("a", "b");
  design.nodes.push({ id: "loose", agent: "critic", model: "fast", search: false });
  const layout = layoutDesign(design, {});
  const loose = layout.nodes.find((n) => n.id === "loose");
  const placedMax = Math.max(...layout.nodes.filter((n) => n.id !== "loose").map((n) => n.y));
  assert.ok(loose.y > placedMax);
});

test("hub patterns place the hub after (par, debate) or before (supervisor) the others", () => {
  const par = {
    pattern: "parallel",
    nodes: [
      { id: "w1", agent: "researcher", model: "fast", search: true },
      { id: "w2", agent: "researcher", model: "fast", search: true },
      { id: "comb", agent: "combiner", model: "fast", search: false },
    ],
    edges: [{ from: "w1", to: "comb" }, { from: "w2", to: "comb" }],
  };
  const p = layoutDesign(par, {});
  const y = (layout, id) => layout.nodes.find((n) => n.id === id).y;
  assert.ok(y(p, "comb") > y(p, "w1"));
  assert.equal(y(p, "w1"), y(p, "w2"));

  const sup = {
    pattern: "supervisor",
    nodes: [
      { id: "boss", agent: "supervisor", model: "fast", search: false },
      { id: "w1", agent: "writer", model: "fast", search: false },
      { id: "w2", agent: "writer", model: "fast", search: false },
    ],
    edges: [{ from: "boss", to: "w1" }, { from: "boss", to: "w2" }],
  };
  const s = layoutDesign(sup, {});
  assert.ok(y(s, "boss") < y(s, "w1"));
  assert.equal(y(s, "w1"), y(s, "w2"));
});

test("canConnect says what connect would say, without changing anything", () => {
  const editor = createEditor("sequential");
  const a = add(editor, "planner");
  const b = add(editor, "writer");
  const c = add(editor, "critic");
  assert.deepEqual(editor.canConnect(a, b), { ok: true });
  assert.equal(editor.design().edges.length, 0);
  editor.connect(a, b);
  assert.deepEqual(editor.canConnect(a, c), { ok: false, code: "seq.notChain" });
  assert.deepEqual(editor.canConnect(a, a), { ok: false, code: "edge.self" });
});

test("nodes can be moved, positions are copied out, and tidy clears them", () => {
  const editor = createEditor("sequential");
  const a = add(editor, "planner");
  editor.setPosition(a, 120.4, -5);
  assert.deepEqual(editor.positions(), { [a]: { x: 120, y: 0 } });
  editor.positions()[a].x = 999;
  assert.equal(editor.positions()[a].x, 120);
  editor.removeNode(a);
  assert.deepEqual(editor.positions(), {});
  const b = add(editor, "writer");
  editor.setPosition(b, 10, 10);
  editor.clearPositions();
  assert.deepEqual(editor.positions(), {});
  editor.setPosition(b, 10, 10);
  editor.reset("parallel");
  assert.deepEqual(editor.positions(), {});
});

test("positions never leak into the design that is sent to the server", () => {
  const editor = createEditor("sequential");
  const a = add(editor, "planner");
  editor.setPosition(a, 50, 50);
  assert.ok(!JSON.stringify(editor.design()).includes("50"));
});

test("with nothing connected yet the first node sits in the first cell, not one cell in", () => {
  const design = { pattern: "sequential", nodes: [{ id: "planner", agent: "planner" }], edges: [] };
  assert.deepEqual(layoutDesign(design, { orientation: "horizontal" }).nodes, [{ id: "planner", x: 0, y: 0 }]);
  assert.deepEqual(layoutDesign(design, { orientation: "vertical" }).nodes, [{ id: "planner", x: 0, y: 0 }]);
});

test("a critic can be set to add its notes to the previous agent's output", () => {
  const editor = createEditor("sequential");
  const a = editor.addNode("researcher").id;
  const b = editor.addNode("critic", { addToPrevious: true }).id;
  editor.connect(a, b);
  assert.equal(editor.design().nodes[1].addToPrevious, true);
  assert.equal(validateDesign(editor.design()).ok, true);
  editor.setNode(b, { addToPrevious: undefined });
  assert.equal(editor.design().nodes[1].addToPrevious, undefined);
  assert.equal(validateDesign(editor.design()).ok, true);
});

// ---- evaluator loop ----
test("a reset to the evaluator loop starts with a writer, an evaluator, one edge, 3 rounds and the given criteria", () => {
  const editor = createEditor("sequential");
  editor.reset("evaluator", { criteria: "Be short." });
  const design = editor.design();
  assert.deepEqual(design.nodes.map((n) => n.agent), ["writer", "evaluator"]);
  assert.deepEqual(design.edges, [{ from: "writer", to: "evaluator" }]);
  assert.equal(design.rounds, 3);
  assert.equal(design.criteria, "Be short.");
  assert.equal(validateDesign(design).ok, true);
});

test("setCriteria and setRounds appear in the design, other patterns carry no criteria", () => {
  const editor = createEditor("evaluator");
  editor.reset("evaluator", { criteria: "a" });
  editor.setCriteria("New criteria");
  editor.setRounds(4);
  assert.equal(editor.design().criteria, "New criteria");
  assert.equal(editor.design().rounds, 4);
  editor.reset("sequential");
  assert.equal("criteria" in editor.design(), false);
  assert.equal("rounds" in editor.design(), false);
});

test("in an evaluator loop a second writer or evaluator cannot be added, and removing one lets it be added again", () => {
  const editor = createEditor("evaluator");
  editor.reset("evaluator");
  assert.equal(editor.addNode("writer").code, "node.duplicate");
  assert.equal(editor.addNode("evaluator").code, "node.duplicate");
  assert.equal(editor.addNode("critic").code, "node.agentNotAllowed");
  editor.removeNode("evaluator");
  assert.equal(editor.addNode("evaluator").ok, true);
  assert.equal(editor.paletteFor().find((p) => p.agent === "writer").allowed, false);
});

test("the evaluator loop allows only the edge writer to evaluator", () => {
  const editor = createEditor("evaluator");
  const writer = add(editor, "writer");
  const evaluator = add(editor, "evaluator");
  assert.equal(editor.canConnect(evaluator, writer).code, "eval.edges");
  assert.equal(editor.connect(writer, evaluator).ok, true);
  assert.equal(editor.canConnect(writer, evaluator).ok, false);
});

test("writer can be added more than once in the other patterns", () => {
  const editor = createEditor("sequential");
  add(editor, "writer");
  add(editor, "writer");
});

test("layout puts the writer before the evaluator", () => {
  const editor = createEditor("evaluator");
  editor.reset("evaluator");
  const { nodes } = layoutDesign(editor.design(), { orientation: "horizontal" });
  const x = (id) => nodes.find((n) => n.id === id).x;
  assert.ok(x("writer") < x("evaluator"));
});

// ---- handoff ----
test("handoff: the first agent added is the start", () => {
  const editor = createEditor("handoff");
  const a = add(editor, "planner");
  add(editor, "writer");
  assert.equal(editor.start(), a);
  assert.equal(editor.design().start, a);
});

test("handoff: setStart changes it and unknown ids are ignored", () => {
  const editor = createEditor("handoff");
  add(editor, "planner");
  const b = add(editor, "writer");
  editor.setStart(b);
  assert.equal(editor.start(), b);
  editor.setStart("nobody");
  assert.equal(editor.start(), b);
});

test("handoff: removing the start agent moves it to the first remaining agent", () => {
  const editor = createEditor("handoff");
  const a = add(editor, "planner");
  const b = add(editor, "writer");
  editor.removeNode(a);
  assert.equal(editor.start(), b);
  editor.removeNode(b);
  assert.equal(editor.start(), undefined);
  assert.equal("start" in editor.design(), false);
});

test("handoff: a design with the start and an edge passes validateDesign; both directions are allowed, a duplicate is not", () => {
  const editor = createEditor("handoff");
  const a = add(editor, "planner");
  const b = add(editor, "writer");
  assert.equal(editor.connect(a, b).ok, true);
  assert.equal(editor.connect(b, a).ok, true);
  assert.equal(editor.connect(a, b).code, "edge.duplicate");
  assert.equal(editor.connect(a, a).code, "edge.self");
  assert.deepEqual(validateDesign(editor.design()).errors, []);
});

test("handoff: layout puts the start first and the agents it hands to next", () => {
  const editor = createEditor("handoff");
  const a = add(editor, "planner");
  const b = add(editor, "researcher");
  const c = add(editor, "writer");
  const d = add(editor, "critic");
  editor.connect(a, b);
  editor.connect(b, c);
  editor.setStart(b);
  const at = (id) => layoutDesign(editor.design(), { orientation: "horizontal" }).nodes.find((n) => n.id === id);
  assert.equal(at(b).x, 0);
  assert.equal(at(c).x, 1);
  assert.ok(at(d).x > at(c).x, "an agent not reached goes after the others");
});
