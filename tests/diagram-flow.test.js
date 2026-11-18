import test from "node:test";
import assert from "node:assert/strict";
import { arrowsOf, autoPositions, extentOf, isTwoWay, turnArrows } from "../public/js/create/diagram-geometry.js";
import { flowState } from "../public/js/replay/flow.js";

const supervisor = {
  pattern: "supervisor",
  nodes: [{ id: "s", agent: "supervisor" }, { id: "w1", agent: "researcher" }, { id: "w2", agent: "writer" }],
  edges: [{ from: "s", to: "w1" }, { from: "s", to: "w2" }],
};
const debate = {
  pattern: "debate",
  rounds: 3,
  nodes: [{ id: "a", agent: "debater" }, { id: "b", agent: "debater" }, { id: "j", agent: "judge" }],
  edges: [{ from: "a", to: "j" }, { from: "b", to: "j" }],
};
const chain = {
  pattern: "sequential",
  nodes: [{ id: "x", agent: "researcher" }, { id: "y", agent: "writer" }],
  edges: [{ from: "x", to: "y" }],
};

test("a supervisor edge is drawn as two arrows, one per direction, side by side", () => {
  assert.equal(isTwoWay(supervisor), true);
  const pos = autoPositions(supervisor, { wide: true });
  const arrows = arrowsOf(supervisor, pos);
  assert.deepEqual(arrows.map((a) => a.key).sort(), ["s>w1", "s>w2", "w1>s", "w2>s"]);
  const down = arrows.find((a) => a.key === "s>w1").d;
  const up = arrows.find((a) => a.key === "w1>s").d;
  assert.notEqual(down, up);
});

test("a chain has one arrow per edge and no two-way arrows", () => {
  const arrows = arrowsOf(chain, autoPositions(chain, { wide: true }));
  assert.deepEqual(arrows.map((a) => a.key), ["x>y"]);
});

test("a debate has turn arrows between debaters and a dashed return arc only for more than one round", () => {
  const pos = autoPositions(debate, { wide: true });
  const turns = turnArrows(debate, pos);
  assert.deepEqual(turns.map((a) => [a.key, a.kind]), [["turn:a>b", "turn"], ["turn:b>a", "return"]]);
  const single = { ...debate, rounds: 1 };
  assert.deepEqual(turnArrows(single, autoPositions(single, { wide: true })).map((a) => a.key), ["turn:a>b"]);
});

test("the diagram is big enough for every box", () => {
  const pos = autoPositions(supervisor, { wide: false });
  const { width, height } = extentOf(pos);
  for (const p of pos.values()) {
    assert.ok(p.x < width && p.y < height);
  }
});

test("flowState marks the handoffs that have happened and the latest one", () => {
  const events = [
    { type: "run_start" },
    { type: "handoff", from: "s", to: "w1" },
    { type: "handoff", from: "w1", to: "s" },
    { type: "handoff", from: "s", to: "w2" },
  ];
  const none = flowState(events, 1, supervisor);
  assert.equal(none.used.size, 0);
  assert.equal(none.latest, null);
  const two = flowState(events, 3, supervisor);
  assert.deepEqual([...two.used].sort(), ["s>w1", "w1>s"]);
  assert.deepEqual(two.latest, { key: "w1>s", index: 2 });
  assert.equal(flowState(events, 99, supervisor).latest.key, "s>w2");
});

test("flowState lights the turn arrow when the next debater starts", () => {
  const events = [
    { type: "agent_start", agent: "a" },
    { type: "handoff", from: "a", to: "j" },
    { type: "agent_start", agent: "b" },
    { type: "handoff", from: "b", to: "j" },
    { type: "agent_start", agent: "a" },
  ];
  const state = flowState(events, events.length, debate);
  assert.ok(state.used.has("turn:a>b"));
  assert.ok(state.used.has("turn:b>a"));
  assert.ok(state.used.has("a>j"));
  assert.deepEqual(state.latest, { key: "turn:b>a", index: 4 });
});

// A very small stand-in for the document, enough for the replay diagram.
function fakeDoc() {
  const make = (name) => {
    const el = {
      name,
      attrs: {},
      children: [],
      style: {},
      listeners: {},
      hidden: false,
      textContent: "",
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k]; },
      append(...c) { this.children.push(...c); },
      replaceChildren(...c) { this.children = c; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
    };
    return el;
  };
  return { createElement: make, createElementNS: (ns, name) => make(name), createTextNode: (text) => ({ text }) };
}

test("the replay diagram colours boxes by state, lights the arrow just used and blinks it once", async () => {
  const { createReplayDiagram } = await import("../public/js/replay/diagram.js");
  const selected = [];
  let clockNow = 1000;
  const diagram = createReplayDiagram({ doc: fakeDoc(), design: supervisor, wide: true, boxLabel: (id) => id, statusText: (a) => a.status, onSelect: (id) => selected.push(id), clock: { setTimeout: () => 1, clearTimeout: () => {} }, now: () => clockNow });
  const events = [{ type: "run_start" }, { type: "handoff", from: "s", to: "w1" }];
  const state = { agents: { s: { status: "working", label: "Supervisor" }, w1: { status: "waiting", label: "Researcher" } } };
  diagram.update({ events, cursor: 2, state, selectedId: "s", badgeText: "" });
  const area = diagram.element.children[0];
  const paths = area.children[0].children.filter((c) => c.name === "path" && c.attrs["data-flow"]);
  const byKey = Object.fromEntries(paths.map((p) => [p.attrs["data-flow"], p.attrs.class]));
  assert.match(byKey["s>w1"], /lit blink-/);
  assert.equal(byKey["w1>s"], "flow pending");
  const boxes = area.children.filter((c) => c.attrs["data-node-id"]);
  assert.equal(boxes.find((b) => b.attrs["data-node-id"] === "s").attrs["data-status"], "working");
  assert.equal(boxes.find((b) => b.attrs["data-node-id"] === "w2").attrs["data-status"], "waiting");
  boxes[0].listeners.click();
  assert.deepEqual(selected, ["s"]);
  // A second later, when the next step arrives, the first arrow is still lit and blinking.
  clockNow = 2000;
  const more = [...events, { type: "handoff", from: "w1", to: "s" }];
  diagram.update({ events: more, cursor: 3, state, selectedId: "s", badgeText: "Round 1 of 3" });
  assert.match(paths.find((p) => p.attrs["data-flow"] === "s>w1").attrs.class, /lit blink-/);
  // Some seconds later it has settled to a solid arrow.
  clockNow = 9000;
  diagram.update({ events: more, cursor: 3, state, selectedId: "s", badgeText: "" });
  assert.equal(paths.find((p) => p.attrs["data-flow"] === "s>w1").attrs.class, "flow used");
  // Once the time is over every arrow that has carried data is solid grey, the latest one too.
  assert.equal(paths.find((p) => p.attrs["data-flow"] === "w1>s").attrs.class, "flow used");
});

test("the arrows of a two-way connection start and end on the edges of the boxes, not under them", async () => {
  const { BOX_H, BOX_W, TOUCH, autoPositions, straight } = await import("../public/js/create/diagram-geometry.js");
  const pos = autoPositions(supervisor, { wide: true });
  const inside = (p, id) => {
    const b = pos.get(id);
    return p.x > b.x + TOUCH + 0.01 && p.x < b.x + BOX_W - TOUCH - 0.01 && p.y > b.y + TOUCH + 0.01 && p.y < b.y + BOX_H - TOUCH - 0.01;
  };
  for (const [from, to] of [["s", "w1"], ["w1", "s"], ["s", "w2"], ["w2", "s"]]) {
    const l = straight(pos, from, to, -9);
    // The ends are at most TOUCH pixels inside the boxes: neither end is deep inside a box.
    assert.equal(inside({ x: l.x1, y: l.y1 }, from), false, `${from}>${to} start`);
    assert.equal(inside({ x: l.x2, y: l.y2 }, to), false, `${from}>${to} end`);
  }
});

test("the round number in the badge of a debate is its own flashing element", async () => {
  const { createReplayDiagram, ROUND_MARK } = await import("../public/js/replay/diagram.js");
  const diagram = createReplayDiagram({ doc: fakeDoc2(), design: debate, wide: true, boxLabel: (id) => id, statusText: () => "", onSelect: () => {}, clock: { setTimeout: () => 1, clearTimeout: () => {} } });
  const badge = diagram.element.children.at(-1);
  diagram.update({ events: [], cursor: 0, state: { agents: {} }, selectedId: null, badgeText: `Round ${ROUND_MARK} of 3`, badgeNumber: 2 });
  assert.equal(badge.children.length, 3);
  assert.equal(badge.children[1].attrs.class, "round-no");
  assert.equal(badge.children[0].text + badge.children[1].children[0].text + badge.children[2].text, "Round 2 of 3");
});

function fakeDoc2() {
  const make = (name) => ({
    name, attrs: {}, children: [], style: {}, listeners: {}, hidden: false, textContent: "",
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return this.attrs[k]; },
    append(...c) { this.children.push(...c); },
    replaceChildren(...c) { this.children = c; },
    addEventListener() {},
  });
  return { createElement: make, createElementNS: (ns, name) => make(name), createTextNode: (text) => ({ text }) };
}

test("an evaluator loop has a dashed return arrow from the evaluator to the writer, keyed like the feedback handoff", () => {
  const design = { pattern: "evaluator", rounds: 3, criteria: "", nodes: [{ id: "writer", agent: "writer" }, { id: "evaluator", agent: "evaluator" }], edges: [{ from: "writer", to: "evaluator" }] };
  const pos = autoPositions(design, { wide: true });
  const arrows = arrowsOf(design, pos);
  assert.deepEqual(arrows.map((a) => [a.key, a.kind]), [["writer>evaluator", "edge"], ["evaluator>writer", "return"]]);
});

test("a handoff design draws an edge and its reverse as two separate paths", () => {
  const design = { pattern: "handoff", start: "a", nodes: [{ id: "a", agent: "planner" }, { id: "b", agent: "writer" }], edges: [{ from: "a", to: "b" }, { from: "b", to: "a" }] };
  const arrows = arrowsOf(design, autoPositions(design, { wide: true }));
  assert.deepEqual(arrows.map((x) => x.key), ["a>b", "b>a"]);
  assert.notEqual(arrows[0].d, arrows[1].d);
  const [one, two] = arrows.map((x) => x.d.match(/-?[\d.]+/g).map(Number));
  assert.notEqual(one[1], two[3], "the two arrows do not lie on the same line");
});

test("the replay diagram of a voting run shows who agrees, dims the voter that differs and shows the count on the tally", async () => {
  const { createReplayDiagram } = await import("../public/js/replay/diagram.js");
  const design = { pattern: "voting", nodes: [{ id: "a", agent: "researcher" }, { id: "b", agent: "writer" }, { id: "c", agent: "critic" }, { id: "tally", agent: "tally" }], edges: [{ from: "a", to: "tally" }, { from: "b", to: "tally" }, { from: "c", to: "tally" }] };
  const diagram = createReplayDiagram({ doc: fakeDoc(), design, wide: true, boxLabel: (id) => id, statusText: (a) => a.status, onSelect: () => {}, clock: { setTimeout: () => 1, clearTimeout: () => {} }, now: () => 1000 });
  const state = { agents: Object.fromEntries(["a", "b", "c", "tally"].map((id) => [id, { status: "done", label: id }])) };
  const marks = new Map([["a", { text: "agrees" }], ["b", { text: "agrees" }], ["c", { text: "differs", dissent: true }], ["tally", { text: "2 of 3" }]]);
  diagram.update({ events: [{ type: "run_start" }], cursor: 1, state, selectedId: null, badgeText: "2 of 3 agree", marks });
  const area = diagram.element.children[0];
  const box = (id) => area.children.find((c) => c.attrs["data-node-id"] === id);
  const small = (id) => box(id).children[1].textContent;
  assert.equal(small("a"), "agrees");
  assert.equal(small("c"), "differs");
  assert.equal(small("tally"), "2 of 3");
  assert.equal(box("c").attrs["data-dissent"], "true");
  assert.equal(box("a").attrs["data-dissent"], "false");
  const paths = area.children[0].children.filter((c) => c.name === "path" && c.attrs["data-flow"]);
  assert.equal(paths.find((p) => p.attrs["data-flow"] === "c>tally").attrs["data-dissent"], "true");
  assert.equal(paths.find((p) => p.attrs["data-flow"] === "a>tally").attrs["data-dissent"], "false");
});
