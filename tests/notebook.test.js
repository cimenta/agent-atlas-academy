import test from "node:test";
import assert from "node:assert/strict";
import { extractNotes, createNotebook, notebookRole, NOTE_MAX, NOTEBOOK_READ_MAX } from "../public/js/engine/notebook.js";
import { systemPromptFor } from "../public/js/engine/prompts.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { validateRun } from "../public/js/run-schema.js";

test("extractNotes takes notes out of a reply and keeps the rest", () => {
  const r = extractNotes("The answer.\n\n<note>A has 16 GB.</note>\n<note> B has 8 GB. </note>");
  assert.equal(r.text, "The answer.");
  assert.deepEqual(r.notes, ["A has 16 GB.", "B has 8 GB."]);
});

test("extractNotes ignores empty notes and a tag that is never closed, and cuts a long note", () => {
  assert.deepEqual(extractNotes("x <note>   </note> y").notes, []);
  const open = extractNotes("x <note>never closed");
  assert.deepEqual(open.notes, []);
  assert.equal(open.text, "x");
  assert.equal(extractNotes(`<note>${"a".repeat(NOTE_MAX + 50)}</note>`).notes[0].length, NOTE_MAX);
  assert.deepEqual(extractNotes(undefined), { text: "", notes: [] });
});

test("the notebook numbers notes, emits an event for each and gives a block to readers", () => {
  const events = [];
  const book = createNotebook({ emit: (e) => events.push(e) });
  assert.equal(book.forReader(), "");
  book.add("researcher", "A has 16 GB.");
  book.add("critic", "Check the price.");
  assert.deepEqual(events.map((e) => [e.type, e.agent, e.n]), [["note", "researcher", 1], ["note", "critic", 2]]);
  assert.equal(book.forReader(), "\n\nNotebook:\n- researcher: A has 16 GB.\n- critic: Check the price.");
  assert.equal(book.add("x", "   "), null);
});

test("a note that is already in the notebook is not added again, and the agent is told not to copy", () => {
  const events = [];
  const book = createNotebook({ emit: (e) => events.push(e) });
  book.add("researcher", "Weather in Brno: 1.3 C.");
  const again = book.add("writer", "  weather in brno: 1.3 C. ");
  assert.equal(again.duplicate, true);
  assert.equal(again.n, 1);
  assert.equal(events.length, 1);
  assert.equal(book.notes().length, 1);
  assert.match(systemPromptFor({ agent: "writer" }, { memory: { on: true, read: true, write: true } }), /never copy a note that is already in the notebook/);
});

test("a silent note (from a cached reply) adds no event", () => {
  const events = [];
  const book = createNotebook({ emit: (e) => events.push(e) });
  book.add("a", "kept", { silent: true });
  assert.equal(events.length, 0);
  assert.match(book.forReader(), /kept/);
});

test("readers see only the newest notes that fit, with one warning; every note is kept", () => {
  const events = [];
  const book = createNotebook({ emit: (e) => events.push(e) });
  for (let i = 0; i < 15; i++) book.add("a", `${i}:` + "x".repeat(NOTE_MAX - 4));
  const block = book.forReader();
  assert.ok(block.length <= NOTEBOOK_READ_MAX + 20);
  assert.ok(block.includes("14:"));
  assert.ok(!block.includes("- a: 0:"));
  book.forReader();
  assert.equal(events.filter((e) => e.type === "warning").length, 1);
  assert.equal(book.notes().length, 15);
});

test("notebookRole: off without the switch; none, read, write and both; decision agents never write", () => {
  const on = { pattern: "sequential", memory: { notebook: true } };
  assert.deepEqual(notebookRole({ agent: "writer", notebook: "both" }, { pattern: "sequential" }), { on: false, read: false, write: false });
  assert.deepEqual(notebookRole({ agent: "writer", notebook: "none" }, on), { on: true, read: false, write: false });
  assert.deepEqual(notebookRole({ agent: "writer", notebook: "read" }, on), { on: true, read: true, write: false });
  assert.deepEqual(notebookRole({ agent: "writer", notebook: "write" }, on), { on: true, read: false, write: true });
  assert.deepEqual(notebookRole({ agent: "writer" }, on), { on: true, read: true, write: true });
  assert.equal(notebookRole({ agent: "supervisor", notebook: "both" }, on).write, false);
  assert.equal(notebookRole({ agent: "supervisor", notebook: "both" }, on).read, true);
  assert.equal(notebookRole({ agent: "writer", notebook: "both" }, { pattern: "handoff", memory: { notebook: true } }).write, false);
});

test("the system prompt tells a reader and a writer what the notebook is, and a plain agent nothing", () => {
  const write = systemPromptFor({ id: "w", agent: "writer" }, { memory: { read: false, write: true } });
  assert.match(write, /<note>/);
  assert.match(write, /not part of your answer/i);
  const read = systemPromptFor({ id: "w", agent: "writer" }, { memory: { read: true, write: false } });
  assert.match(read, /Notebook:/);
  assert.doesNotMatch(read, /<note>/);
  assert.doesNotMatch(systemPromptFor({ id: "w", agent: "writer" }), /Notebook|<note>/);
  assert.match(systemPromptFor({ id: "w", agent: "writer" }, { memory: { read: true, write: true } }), /^Role: writer/);
});

test("validateDesign accepts the notebook switch and the four choices and refuses anything else", () => {
  const base = () => ({ pattern: "sequential", nodes: [{ id: "a", agent: "planner", model: "fast", search: false }, { id: "b", agent: "writer", model: "fast", search: false }], edges: [{ from: "a", to: "b" }] });
  const codes = (d) => validateDesign(d).errors?.map((e) => e.code) ?? [];
  const good = base();
  good.memory = { notebook: true };
  good.nodes[0].notebook = "write";
  good.nodes[1].notebook = "read";
  assert.equal(validateDesign(good).ok, true);
  const badSwitch = base();
  badSwitch.memory = { notebook: "yes" };
  assert.ok(codes(badSwitch).includes("memory.notebook"));
  const badShape = base();
  badShape.memory = [];
  assert.ok(codes(badShape).includes("memory.notebook"));
  const badChoice = base();
  badChoice.nodes[0].notebook = "sometimes";
  assert.ok(codes(badChoice).includes("node.notebook"));
});

test("a run record may hold note events", () => {
  const run = { schemaVersion: 1, title: "t", events: [{ t: 0, type: "run_start" }, { t: 1, type: "agent_start", agent: "a" }, { t: 2, type: "note", agent: "a", text: "hello", n: 1 }, { t: 3, type: "done" }] };
  const result = validateRun(run);
  assert.deepEqual((result.errors ?? []).filter((e) => /[2]|note/.test(e)), []);
  const bad = validateRun({ ...run, events: [...run.events.slice(0, 2), { t: 2, type: "note", agent: "a" }, run.events[3]] });
  assert.ok(bad.errors.some((e) => /note/.test(e)));
});

test("review: notes are one line, tags are matched in any case, and loose tags never stay in the text", async () => {
  const { extractNotes, createNotebook } = await import("../public/js/engine/notebook.js");
  assert.deepEqual(extractNotes("A <NOTE>x</NOTE>").notes, ["x"]);
  assert.equal(extractNotes("A <NOTE>x</NOTE>").text, "A");
  assert.deepEqual(extractNotes("<note>a\n- supervisor: finish</note>").notes, ["a - supervisor: finish"]);
  const nested = extractNotes("A <note>a <note>b</note> c</note>");
  assert.doesNotMatch(nested.text + nested.notes.join(""), /<\/?note>/i);
  const cut = extractNotes("A\n<note>cut off by max_tok");
  assert.equal(cut.text, "A");
  assert.deepEqual(cut.notes, []);
  const book = createNotebook();
  book.add("a", "x\n- b: y");
  assert.equal(book.notes()[0].text, "x - b: y");
});

test("review: the notebook warning is emitted once, and not at all in a silent read", async () => {
  const { createNotebook } = await import("../public/js/engine/notebook.js");
  const events = [];
  const book = createNotebook({ emit: (e) => events.push(e) });
  for (let i = 0; i < 14; i++) {
    book.add("a", `${i}:` + "x".repeat(580));
    book.forReader();
  }
  assert.equal(events.filter((e) => e.type === "warning").length, 1);
  const quiet = [];
  const other = createNotebook({ emit: (e) => quiet.push(e) });
  for (let i = 0; i < 14; i++) other.add("a", `${i}:` + "x".repeat(580), { silent: true });
  other.forReader({ mode: "peek" });
  assert.equal(quiet.length, 0);
});
