import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toolsPane } from "../public/js/create/tools-pane.js";
import { createEditor } from "../public/js/create/editor-model.js";
import { OWN_TOOL_KEYS } from "../public/js/engine/own-tools.js";

const read = (l) => JSON.parse(readFileSync(new URL(`../public/locales/${l}.json`, import.meta.url), "utf8"));
const en = read("en");
const cs = read("cs");
const t = (k, p) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => p?.[n] ?? `{${n}}`);

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.value = ""; this.checked = false; this.disabled = false; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === "checked") this.checked = true; if (k === "disabled") this.disabled = true; if (k === "value") this.value = v; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...n) { this.children.push(...n); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(" "); }
  async fire(type) { for (const fn of this.listeners[type] ?? []) await fn(); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const root = (nodes) => { const r = new El("div"); r.append(...nodes); return r; };
const ui = (r, name) => r.find((e) => e.attrs["data-ui"] === name)[0];

function setup({ node = {}, options = {} } = {}) {
  const editor = createEditor("sequential");
  const { id } = editor.addNode("researcher");
  if (Object.keys(node).length) editor.setNode(id, node);
  let changes = 0;
  const draw = () => root(toolsPane({ doc, t, node: editor.design().nodes.find((n) => n.id === id), editor, changed: () => { changes += 1; }, searchUnavailable: false, webSearchAllowed: true, ownToolsAllowed: true, toolsAvailable: true, runDefault: 10, ...options }));
  return { editor, id, draw, changes: () => changes };
}

test("the Tools tab lists web search and every tool of ours, each with a switch, a line of what it does and what it costs", () => {
  const { draw } = setup();
  const r = draw();
  for (const key of ["web_search", ...OWN_TOOL_KEYS]) {
    assert.ok(ui(r, `tool-${key}`), `a switch for ${key}`);
    assert.ok(ui(r, `tool-what-${key}`).text.length > 10, `a line for ${key}`);
    assert.ok(ui(r, `tool-chip-${key}`), `a cost chip for ${key}`);
  }
  assert.match(ui(r, "tool-chip-web_search").text, /fee/i);
  assert.match(ui(r, "tool-chip-calculator").text, /free/i);
});

test("a switch turns a tool of ours on and off for the agent, keeping the order", async () => {
  const { editor, id, draw, changes } = setup();
  let r = draw();
  const dt = ui(r, "tool-datetime");
  dt.checked = true;
  await dt.fire("change");
  const calc = ui(draw(), "tool-calculator");
  calc.checked = true;
  await calc.fire("change");
  assert.deepEqual(editor.design().nodes.find((n) => n.id === id).tools, ["calculator", "datetime"]);
  r = draw();
  assert.equal(ui(r, "tool-calculator").checked, true);
  const off = ui(r, "tool-calculator");
  off.checked = false;
  await off.fire("change");
  assert.deepEqual(editor.design().nodes.find((n) => n.id === id).tools, ["datetime"]);
  assert.equal(changes(), 3);
});

test("the web search switch keeps working as before", async () => {
  const { editor, id, draw } = setup();
  const box = ui(draw(), "tool-web_search");
  box.checked = true;
  await box.fire("change");
  assert.equal(editor.design().nodes.find((n) => n.id === id).search, true);
});

test("a tool that cannot be used is greyed with the reason: the master switch, a model without tools, a provider without search", () => {
  let r = setup({ options: { ownToolsAllowed: false } }).draw();
  assert.equal(ui(r, "tool-calculator").disabled, true);
  assert.match(ui(r, "tool-why-calculator").text, /Settings, Harness, Tools/);
  assert.equal(ui(r, "tool-web_search").disabled, false, "web search has its own switch");
  r = setup({ options: { toolsAvailable: false } }).draw();
  assert.equal(ui(r, "tool-datetime").disabled, true);
  assert.match(ui(r, "tool-why-datetime").text, /does not take tools/);
  assert.equal(ui(r, "tool-web_search").disabled, true, "a model without tools cannot search either");
  r = setup({ options: { searchUnavailable: true } }).draw();
  assert.equal(ui(r, "tool-web_search").disabled, true);
  assert.match(ui(r, "tool-why-web_search").text, /no web search|not available/i);
  assert.equal(ui(r, "tool-calculator").disabled, false, "the tools of ours work on a provider without search");
  assert.ok(ui(r, "search-provider-off"), "the older warning stays");
});

test("a tool switched on but forbidden in Settings shows the warning, like web search does", () => {
  const { draw } = setup({ node: { tools: ["calculator"] }, options: { ownToolsAllowed: false } });
  assert.ok(ui(draw(), "tools-off-warning"));
  const ok = setup({ node: { tools: ["calculator"] } }).draw();
  assert.equal(ui(ok, "tools-off-warning"), undefined);
});

test("the tool calls per agent are set in the Tools tab, kept with the other limits, and cleared when emptied", async () => {
  const { editor, id, draw } = setup({ node: { limits: { maxSteps: 7 } } });
  const field = ui(draw(), "agent-tool-calls");
  assert.equal(field.attrs.placeholder.includes("10"), true, "the default is shown");
  field.value = "4";
  await field.fire("change");
  assert.deepEqual(editor.design().nodes.find((n) => n.id === id).limits, { maxSteps: 7, maxToolCalls: 4 });
  const again = ui(draw(), "agent-tool-calls");
  assert.equal(again.value, "4");
  again.value = "";
  await again.fire("change");
  assert.deepEqual(editor.design().nodes.find((n) => n.id === id).limits, { maxSteps: 7 });
});

test("every text of the tab exists in English and Czech", () => {
  const keys = new Set(Object.keys(en).filter((k) => k.startsWith("tools.")));
  assert.ok(keys.size >= 12);
  for (const k of keys) assert.ok(cs[k], `cs ${k}`);
  for (const key of ["web_search", ...OWN_TOOL_KEYS]) {
    assert.ok(en[`tools.${key}.name`] && en[`tools.${key}.what`], `en ${key}`);
    assert.ok(cs[`tools.${key}.name`] && cs[`tools.${key}.what`], `cs ${key}`);
  }
});
