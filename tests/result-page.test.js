import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderResult } from "../public/js/result-page.js";

// A very small stand-in for the DOM: elements with attributes, children and click handlers.
class Node {
  constructor(tag) {
    this.tag = tag;
    this.attrs = {};
    this.children = [];
    this.handlers = {};
  }
  setAttribute(k, v) {
    this.attrs[k] = v;
  }
  set className(v) {
    this.attrs.class = v;
  }
  append(...nodes) {
    this.children.push(...nodes);
  }
  appendChild(n) {
    this.children.push(n);
    return n;
  }
  replaceChildren(...nodes) {
    this.children = nodes;
  }
  addEventListener(type, fn) {
    this.handlers[type] = fn;
  }
  click() {
    return this.handlers.click?.();
  }
  get firstChild() {
    return this.children[0];
  }
  set textContent(value) {
    this.children = [{ tag: "#text", textContent: String(value), find: () => [] }];
  }
  get textContent() {
    return this.children.map((c) => (typeof c === "string" ? c : c.textContent)).join("");
  }
  find(pred, out = []) {
    for (const c of this.children) if (c.tag !== "#text") {
      if (pred(c)) out.push(c);
      c.find(pred, out);
    }
    return out;
  }
}
const fakeDoc = {
  createElement: (tag) => new Node(tag),
  createTextNode: (text) => ({ tag: "#text", textContent: String(text), find: () => [] }),
  createDocumentFragment: () => new Node("#fragment"),
  defaultView: { print() {}, navigator: {} },
  body: new Node("body"),
};
const t = (key, params) => (params ? `${key} ${JSON.stringify(params)}` : key);
const run = JSON.parse(readFileSync(new URL("../public/runs/sequential-simple.json", import.meta.url), "utf8"));

function mount() {
  const main = new Node("main");
  renderResult({ doc: fakeDoc, t, lang: "en", main }, run);
  return main;
}
const byUi = (root, name) => root.find((n) => n.attrs["data-ui"] === name);

test("the Result page shows the outcome, two tabs and the formatted answer first", () => {
  const main = mount();
  assert.equal(byUi(main, "run-outcome").length, 1);
  assert.equal(byUi(main, "result-tab-answer").length, 1);
  assert.equal(byUi(main, "result-tab-stats").length, 1);
  assert.equal(byUi(main, "answer-formatted").length, 1);
  assert.equal(byUi(main, "answer-raw").length, 0);
});

test("the Raw button switches to the markdown source and back", () => {
  const main = mount();
  const raw = main.find((n) => n.attrs["data-view"] === "raw")[0];
  raw.click();
  assert.equal(byUi(main, "answer-raw").length, 1);
  assert.equal(byUi(main, "answer-formatted").length, 0);
  main.find((n) => n.attrs["data-view"] === "formatted")[0].click();
  assert.equal(byUi(main, "answer-formatted").length, 1);
});

test("both views offer a copy button and the three exports", () => {
  const main = mount();
  assert.equal(byUi(main, "answer-copy").length, 1);
  assert.deepEqual(["export-md", "export-html", "export-pdf"].map((n) => byUi(main, n).length), [1, 1, 1]);
  main.find((n) => n.attrs["data-view"] === "raw")[0].click();
  assert.equal(byUi(main, "answer-copy").length, 1);
});

test("the Statistics tab shows the tiles and one row per agent", () => {
  const main = mount();
  byUi(main, "result-tab-stats")[0].click();
  assert.equal(byUi(main, "stats-tiles").length, 1);
  const rows = byUi(main, "stats-agents")[0].find((n) => n.tag === "tr");
  assert.ok(rows.length >= 3, "header row and at least two agents");
  assert.equal(byUi(main, "answer-formatted").length, 0);
});

test("the Statistics tab lists created agents in their own table, and only when there are some", async () => {
  const { runDesign } = await import("../public/js/engine/orchestrator.js");
  const { LIMIT_DEFAULTS } = await import("../public/js/engine/catalog.js");
  const { createMockCall } = await import("../public/js/engine/mock-anthropic.js");
  const design = {
    pattern: "supervisor",
    nodes: [
      { id: "boss", agent: "supervisor", model: "fast", search: false, creates: { max: 2, guidance: "", search: false } },
      { id: "researcher", agent: "researcher", model: "fast", search: false },
    ],
    edges: [{ from: "boss", to: "researcher" }],
  };
  const events = [];
  await runDesign({ design, task: "Explain it", limits: LIMIT_DEFAULTS, call: createMockCall(), emit: (e) => events.push(e) });
  const main = new Node("main");
  renderResult({ doc: fakeDoc, t, lang: "en", main }, { ...run, design, events, recordedWith: { provider: "anthropic" } });
  byUi(main, "result-tab-stats")[0].click();
  const table = byUi(main, "stats-created");
  assert.equal(table.length, 1);
  assert.ok(table[0].textContent.includes("Fact checker"));
  const plain = mount();
  byUi(plain, "result-tab-stats")[0].click();
  assert.equal(byUi(plain, "stats-created").length, 0);
});
