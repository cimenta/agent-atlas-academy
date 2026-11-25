import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createAgent } from "../public/js/engine/agent.js";
import { createBudget } from "../public/js/engine/budget.js";
import { createNotebook, notesToolText, NOTE_MAX } from "../public/js/engine/notebook.js";
import { runTool, toolsFor } from "../public/js/engine/tools.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";
import { createEditor } from "../public/js/create/editor-model.js";
import { toolsPane } from "../public/js/create/tools-pane.js";

const read = (l) => JSON.parse(readFileSync(new URL(`../public/locales/${l}.json`, import.meta.url), "utf8"));
const en = read("en");
const cs = read("cs");
const t = (k, p) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => p?.[n] ?? `{${n}}`);

const access = (book, agent = "a") => ({ write: (text) => book.add(agent, text), read: () => book.forReader({ mode: "peek" }).replace(/^\n\nNotebook:\n/, "") });

test("the notes tool writes a note into the notebook, and reads the notes back, one line each with the name of the writer", () => {
  const events = [];
  const book = createNotebook({ emit: (e) => events.push(e) });
  assert.equal(notesToolText({ action: "read" }, access(book)), "The notebook is empty.");
  assert.equal(notesToolText({ action: "write", text: "The   deadline\nis 14 days." }, access(book, "researcher")), "Note 1 saved.");
  assert.deepEqual(events, [{ type: "note", agent: "researcher", text: "The deadline is 14 days.", n: 1 }], "the same event as a note written with tags");
  notesToolText({ action: "write", text: "Check the price." }, access(book, "critic"));
  assert.equal(notesToolText({ action: "read" }, access(book)), "- researcher: The deadline is 14 days.\n- critic: Check the price.");
});

test("a note that is too long is cut and the model is told; a bad action, an empty note and a missing notebook are error texts", () => {
  const book = createNotebook();
  const out = notesToolText({ action: "write", text: "x".repeat(NOTE_MAX + 50) }, access(book));
  assert.match(out, new RegExp(`cut to ${NOTE_MAX} characters`));
  assert.equal(book.notes()[0].text.length, NOTE_MAX);
  for (const bad of [{ action: "delete" }, {}, { action: "write" }, { action: "write", text: "  <note></note> " }]) assert.throws(() => notesToolText(bad, access(book)), (e) => e.name === "ToolError");
  assert.throws(() => notesToolText({ action: "read" }, null), (e) => e.name === "ToolError" && /switched off/.test(e.message));
});

test("the tool is in the table, runs through runTool, and an error becomes a result for the model", async () => {
  const book = createNotebook();
  const ok = await runTool("notes", { action: "write", text: "hello" }, { notes: access(book) });
  assert.deepEqual({ output: ok.output, error: ok.error }, { output: "Note 1 saved.", error: false });
  const off = await runTool("notes", { action: "read" }, {});
  assert.equal(off.error, true);
  assert.match(off.output, /switched off/);
  assert.deepEqual(toolsFor({ id: "a", model: "fast", search: false, tools: ["notes"] }, createBudget(LIMIT_DEFAULTS), "groq").map((x) => x.name), ["notes"]);
});

const text = (s) => [{ type: "text", text: s }];
const reply = (content, stop_reason = "end_turn") => ({ content, stop_reason, usage: { input_tokens: 10, output_tokens: 5 } });
const asks = (id, input) => reply([{ type: "tool_use", id, name: "notes", input }], "tool_use");

function agentWith({ notebook, nodeExtra = {}, replies }) {
  const calls = [];
  const events = [];
  const node = { id: "writer-1", agent: "researcher", model: "fast", search: false, tools: ["notes"], ...nodeExtra };
  const design = { pattern: "sequential", nodes: [node], edges: [], memory: { notebook: true } };
  const agent = createAgent({ node, design, call: async (body) => { calls.push(structuredClone(body)); return replies.shift(); }, emit: (e) => events.push(e), budget: createBudget(LIMIT_DEFAULTS), notebook, sleep: async () => {} });
  return { agent, calls, events };
}

test("an agent writes a note with the tool and the next agent that reads the notebook sees it", async () => {
  const events = [];
  const book = createNotebook({ emit: (e) => events.push(e) });
  const first = agentWith({ notebook: book, replies: [asks("n1", { action: "write", text: "Refund deadline: 14 days." }), reply(text("Done."))] });
  const result = await first.agent.run("Task: x");
  assert.equal(result.text, "Done.");
  assert.equal(first.calls[1].messages.at(-1).content[0].content, "Note 1 saved.");
  assert.deepEqual(book.notes().map((n) => [n.agent, n.text]), [["writer-1", "Refund deadline: 14 days."]]);
  assert.match(events.map((e) => e.type).join(","), /note/);
  const second = agentWith({ notebook: book, nodeExtra: { id: "critic-1", tools: [] }, replies: [reply(text("Seen."))] });
  await second.agent.run("Task: y");
  assert.match(JSON.stringify(second.calls[0].messages), /Refund deadline: 14 days\./, "the notebook is added to the input of a reader");
});

test("an agent with the notes tool is not told to write notes with tags, one that has no tool is", () => {
  const withTool = agentWith({ notebook: createNotebook(), replies: [reply(text("x"))] });
  return withTool.agent.run("Task: x").then(() => {
    assert.ok(!/<note>/.test(withTool.calls[0].system), "no tags for an agent with the tool");
    const without = agentWith({ notebook: createNotebook(), nodeExtra: { tools: [] }, replies: [reply(text("x"))] });
    return without.agent.run("Task: x").then(() => assert.match(without.calls[0].system, /<note>/));
  });
});

test("a reply of an agent with the tool that holds tags is left as it is: the tags are not the way in for it", async () => {
  const book = createNotebook();
  const { agent } = agentWith({ notebook: book, replies: [reply(text("Answer <note>x</note>"))] });
  await agent.run("Task: x");
  assert.equal(book.notes().length, 0);
});

test("without a notebook in the run the tool says so to the model, and the run goes on", async () => {
  const { agent, calls } = agentWith({ notebook: null, replies: [asks("n1", { action: "read" }), reply(text("No notes then."))] });
  const result = await agent.run("Task: x");
  assert.equal(result.text, "No notes then.");
  assert.equal(calls[1].messages.at(-1).content[0].is_error, true);
  assert.match(calls[1].messages.at(-1).content[0].content, /switched off/);
});

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.value = ""; this.checked = false; this.disabled = false; this.textContent = ""; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === "checked") this.checked = true; if (k === "disabled") this.disabled = true; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...n) { this.children.push(...n); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.textContent + this.children.map((c) => c.text).join(" "); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (s) => ({ text: s }) };
const ui = (r, name) => r.find((e) => e.attrs["data-ui"] === name)[0];

function paneFor({ notebook, tools = [] }) {
  const editor = createEditor("sequential");
  const { id } = editor.addNode("researcher");
  if (tools.length) editor.setNode(id, { tools });
  editor.setNotebook(notebook);
  const r = new El("div");
  r.append(...toolsPane({ doc, t, node: editor.design().nodes.find((n) => n.id === id), editor, changed: () => {} }));
  return r;
}

test("the Tools tab lists the notes tool, greyed with the reason while the notebook is off, and warns when it is on for an agent", () => {
  const off = paneFor({ notebook: false });
  assert.equal(ui(off, "tool-notes").disabled, true);
  assert.match(ui(off, "tool-why-notes").text, /Memory/);
  const on = paneFor({ notebook: true });
  assert.equal(ui(on, "tool-notes").disabled, false);
  assert.equal(ui(on, "tool-why-notes"), undefined);
  assert.ok(ui(paneFor({ notebook: false, tools: ["notes"] }), "notes-off-warning"));
  assert.equal(ui(paneFor({ notebook: true, tools: ["notes"] }), "notes-off-warning"), undefined);
});

test("every text of the notes tool exists in English and Czech", () => {
  for (const k of ["tools.notes.name", "tools.notes.what", "tools.why.notebook", "tools.notesWarning", "insp.doc.notes"]) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
  }
});
