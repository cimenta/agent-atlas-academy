import { test } from "node:test";
import assert from "node:assert/strict";
import { calculate, clockText, countText } from "../public/js/engine/own-tools.js";
import { TOOLS, OWN_TOOL_KEYS, toolsFor, runTool, toolDefinition } from "../public/js/engine/tools.js";
import { createBudget } from "../public/js/engine/budget.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

test("the calculator does arithmetic with the usual order, brackets, powers and a minus", () => {
  assert.equal(calculate("1 + 2 * 3"), "7");
  assert.equal(calculate("(1 + 2) * 3"), "9");
  assert.equal(calculate("2 ^ 10"), "1024");
  assert.equal(calculate("2 ^ 3 ^ 2"), "512", "a power goes from the right");
  assert.equal(calculate("-3 + 5"), "2");
  assert.equal(calculate("10 % 4"), "2");
  assert.equal(calculate("1250 * 0.21 + 99"), "361.5");
  assert.equal(calculate("0.1 + 0.2"), "0.3", "no floating point noise");
});

test("the calculator knows the functions, the constants, and a decimal comma", () => {
  assert.equal(calculate("sqrt(144)"), "12");
  assert.equal(calculate("round(2.567, 1)"), "2.6");
  assert.equal(calculate("max(3, 9, 4) - min(3, 9, 4)"), "6");
  assert.equal(calculate("abs(-4.5)"), "4.5");
  assert.equal(calculate("pi"), "3.14159265359");
  assert.equal(calculate("(1250 * 0,21) + 99"), "361.5", "a decimal comma is read when there is no point");
});

test("the calculator refuses what is not arithmetic, and says why, and never runs code", () => {
  for (const bad of ["", "1 +", "2 / 0", "foo(1)", "process.exit()", "1; 2", "alert(1)", "sqrt(-1)", "(1", "1 2", "9".repeat(300)]) {
    assert.throws(() => calculate(bad), (e) => e.name === "ToolError" && e.message.length > 0, bad.slice(0, 20));
  }
});

test("the clock tells the date, the time, the weekday and the week in a time zone", () => {
  const now = Date.UTC(2026, 10, 25, 13, 32, 7);
  const prague = clockText({ timezone: "Europe/Prague" }, now);
  assert.match(prague, /Wednesday 25 November 2026/);
  assert.match(prague, /14:32:07/);
  assert.match(prague, /Europe\/Prague/);
  assert.match(prague, /week 48/);
  assert.match(clockText({}, now), /UTC/, "UTC without a zone");
  assert.match(clockText({ timezone: "America/New_York" }, now), /08:32:07/);
  assert.throws(() => clockText({ timezone: "Mars/Olympus" }, now), (e) => e.name === "ToolError" && /time zone/i.test(e.message));
});

test("runTool never throws: a bad argument or an unknown tool becomes an error text for the model", async () => {
  const ok = await runTool("calculator", { expression: "6 * 7" });
  assert.deepEqual({ output: ok.output, error: ok.error }, { output: "42", error: false });
  assert.equal(typeof ok.ms, "number");
  const bad = await runTool("calculator", { expression: "1 / 0" });
  assert.equal(bad.error, true);
  assert.match(bad.output, /zero/i);
  const missing = await runTool("calculator", {});
  assert.equal(missing.error, true);
  const unknown = await runTool("teleport", {});
  assert.equal(unknown.error, true);
  assert.match(unknown.output, /teleport/);
  const clock = await runTool("datetime", { timezone: "UTC" }, { now: Date.UTC(2026, 0, 1, 0, 0, 0) });
  assert.match(clock.output, /Thursday 1 January 2026/);
});

test("a tool has a definition the providers can take: a name, a description and a schema of its arguments", () => {
  for (const key of ["calculator", "datetime", "text_stats"]) {
    const def = toolDefinition(key);
    assert.equal(def.name, key);
    assert.ok(def.description.length > 20);
    assert.equal(def.input_schema.type, "object");
  }
  assert.deepEqual(toolDefinition("calculator").input_schema.required, ["expression"]);
  assert.deepEqual(OWN_TOOL_KEYS, ["calculator", "datetime", "wikipedia", "weather", "text_stats", "document_search", "notes"]);
  assert.equal(TOOLS.calculator.kind, "own");
  assert.equal(TOOLS.web_search.kind, "provider");
});

test("an agent is given the tools it has switched on, besides the search, and a provider that cannot search still gets its own tools", () => {
  const budget = createBudget(LIMIT_DEFAULTS);
  const names = (node, provider) => toolsFor(node, budget, provider).map((t) => t.name);
  assert.deepEqual(names({ id: "a", model: "fast", search: false }, "anthropic"), []);
  assert.deepEqual(names({ id: "a", model: "fast", search: false, tools: ["calculator", "datetime"] }, "anthropic"), ["calculator", "datetime"]);
  assert.deepEqual(names({ id: "a", model: "fast", search: true, tools: ["calculator"] }, "anthropic"), ["web_search", "calculator"]);
  assert.deepEqual(names({ id: "a", model: "fast", search: true, tools: ["calculator"] }, "groq"), ["calculator"], "Groq has no search");
  assert.deepEqual(names({ id: "a", model: "fast", search: false, tools: ["calculator", "nonsense", "calculator"] }, "groq"), ["calculator"], "an unknown or repeated key is ignored");
  assert.deepEqual(names({ id: "a", model: "fast", search: true, tools: ["calculator"] }, "google"), ["calculator"], "Gemini does not take its search and functions together, so the functions are kept");
  assert.deepEqual(toolsFor({ id: "a", model: "fast", search: false, tools: ["calculator"] }, budget, "anthropic", { own: false }), [], "after the rounds of tools are used up no tool is offered");
});

test("a design with a bad list of tools on an agent is refused, and a good one is accepted", async () => {
  const { validateDesign } = await import("../public/js/engine/patterns.js");
  const design = (tools) => ({ pattern: "sequential", nodes: [{ id: "a", agent: "researcher", model: "fast", search: false, tools }, { id: "b", agent: "writer", model: "fast", search: false }], edges: [{ from: "a", to: "b" }] });
  const bad = (tools) => validateDesign(design(tools)).errors.some((e) => e.code === "node.tools");
  assert.equal(bad(["calculator", "datetime"]), false);
  assert.equal(bad(undefined), false);
  assert.equal(bad(["teleport"]), true);
  assert.equal(bad(["calculator", "calculator"]), true);
  assert.equal(bad("calculator"), true);
});

test("the editor keeps the tools of an agent cleaned and in order, and drops the field when none is left", async () => {
  const { createEditor } = await import("../public/js/create/editor-model.js");
  const editor = createEditor("sequential");
  const added = editor.addNode("researcher");
  const id = added.id ?? editor.design().nodes[0].id;
  editor.setNode(id, { tools: ["datetime", "nonsense", "calculator", "datetime"] });
  assert.deepEqual(editor.design().nodes[0].tools, ["calculator", "datetime"]);
  editor.setNode(id, { tools: [] });
  assert.equal("tools" in editor.design().nodes[0], false);
});

test("every tool of our own has a definition, and the keys list says the same", () => {
  assert.deepEqual(Object.keys(TOOLS).filter((k) => TOOLS[k].kind === "own"), OWN_TOOL_KEYS);
});

test("the replay shows a call of a tool of ours with its arguments, its own time and its error, and not as a search in the model", async () => {
  const { deriveInspector } = await import("../public/js/replay/inspect-model.js");
  const events = [
    { type: "agent_start", agent: "a", role: "Researcher", model: "m", tools: ["calculator"], system: "s", t: 0 },
    { type: "tool_call", agent: "a", tool: "calculator", own: true, id: "t1", args: { expression: "1 / 0" }, input: '{"expression":"1 / 0"}', t: 5 },
    { type: "tool_result", agent: "a", tool: "calculator", own: true, id: "t1", output: "Division by zero.", error: true, ms: 3, t: 6 },
  ];
  const step = deriveInspector(events).agents.a.steps.find((s) => s.kind === "tool");
  assert.equal(step.own, true);
  assert.equal(step.server, false);
  assert.equal(step.ms, 3);
  assert.equal(step.error, true);
  assert.equal(step.output, "Division by zero.");
  assert.match(step.input, /"expression": "1 \/ 0"/);
});

test("text counting gives the characters, the words, the sentences and the lines, and the longest word", () => {
  const out = countText({ text: "Hello world. How are you?\nFine!" });
  assert.match(out, /characters: 31/);
  assert.match(out, /without spaces: 26/);
  assert.match(out, /words: 6/);
  assert.match(out, /sentences: 3/);
  assert.match(out, /lines: 2/);
  assert.match(out, /longest word: "Hello" \(5 letters\)/);
});

test("text counting counts one letter when asked, the way a model cannot", () => {
  assert.match(countText({ text: "strawberry", letter: "r" }), /letter "r": 3/);
  assert.match(countText({ text: "Strawberry", letter: "S" }), /letter "S": 1/, "upper and lower case are the same letter");
  assert.match(countText({ text: "Zaměstnanec přišel", letter: "e" }), /letter "e": 2/, "a letter with a mark (ě) is another letter");
});

test("text counting refuses what it cannot count, and says why", () => {
  assert.throws(() => countText({}), (e) => e.name === "ToolError");
  assert.throws(() => countText({ text: "" }), (e) => e.name === "ToolError");
  assert.throws(() => countText({ text: "a".repeat(30001) }), (e) => e.name === "ToolError" && /30000/.test(e.message));
  assert.throws(() => countText({ text: "abc", letter: "ab" }), (e) => e.name === "ToolError" && /one letter/.test(e.message));
});

test("the tool text_stats runs through runTool", async () => {
  const done = await runTool("text_stats", { text: "one two three" });
  assert.equal(done.error, false);
  assert.match(done.output, /words: 3/);
});
