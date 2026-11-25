import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DOC_LIMITS, htmlToText, textFromFile, canAdd, passagesOf, searchDocuments, validDocuments, cleanDocuments, docChars } from "../public/js/engine/documents.js";
import { runTool, toolsFor } from "../public/js/engine/tools.js";
import { createBudget } from "../public/js/engine/budget.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { createEditor } from "../public/js/create/editor-model.js";
import { loadDefinition, buildDefinition } from "../public/js/create/definition.js";
import { toolsPane } from "../public/js/create/tools-pane.js";

const read = (l) => JSON.parse(readFileSync(new URL(`../public/locales/${l}.json`, import.meta.url), "utf8"));
const en = read("en");
const cs = read("cs");
const t = (k, p) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => p?.[n] ?? `{${n}}`);

test("a saved web page becomes its text: scripts, styles, menus and comments go, the entities are read, nothing runs", () => {
  const html = `<html><head><title>T</title><style>p{color:red}</style></head><body><nav>Menu Home</nav><!-- note --><h1>Refunds</h1><p>You may return&nbsp;goods &amp; get money back.</p><script>alert(1)</script><p>Within 14 days.<br>Always.</p><footer>Copyright</footer></body></html>`;
  const out = htmlToText(html);
  assert.equal(out, "Refunds\n\nYou may return goods & get money back.\n\nWithin 14 days.\nAlways.");
  assert.ok(!/alert|color|Menu|Copyright|note/.test(out));
  assert.equal(htmlToText("a &#65; &#x42; &unknown; c"), "a A B c");
});

test("a file is read by its extension, and a kind we do not read is refused with a code", () => {
  assert.deepEqual(textFromFile("a.txt", "﻿Hello\r\nthere"), { ok: true, text: "Hello\nthere" });
  assert.equal(textFromFile("page.HTML", "<p>Hi</p>").text, "Hi");
  assert.equal(textFromFile("data.json", '{"a": 1}').ok, true);
  assert.deepEqual(textFromFile("report.pdf", "x"), { ok: false, code: "type" });
  assert.deepEqual(textFromFile("a.docx", "x"), { ok: false, code: "type" });
  assert.deepEqual(textFromFile("a.txt", "  \n "), { ok: false, code: "empty" });
  assert.deepEqual(textFromFile("page.html", "<script>x()</script>"), { ok: false, code: "empty" });
});

test("the documents are limited to 3 and 200000 characters, and cleaned to what fits", () => {
  const d = (n, chars = 10) => ({ name: `d${n}.txt`, text: "x".repeat(chars) });
  assert.equal(validDocuments([d(1), d(2), d(3)]), true);
  assert.equal(validDocuments([d(1), d(2), d(3), d(4)]), false);
  assert.equal(validDocuments([d(1, 200001)]), false);
  assert.equal(validDocuments([d(1, 100000), d(2, 100000)]), true);
  assert.equal(validDocuments([]), false);
  assert.equal(validDocuments("x"), false);
  assert.equal(validDocuments([{ name: "", text: "a" }]), false);
  assert.deepEqual(cleanDocuments([d(1), { name: "bad" }, d(2, 199995), d(3), null]).map((x) => x.name), ["d1.txt", "d3.txt"], "a document that does not fit is left out, a later one that fits stays");
  assert.equal(canAdd([d(1), d(2), d(3)], "a").code, "files");
  assert.equal(canAdd([d(1, 199999)], "ab").code, "size");
  assert.equal(canAdd([d(1)], "ab").ok, true);
  assert.equal(docChars([d(1, 5), d(2, 6)]), 11);
});

test("a text is cut into passages of about 600 characters at a line break or a space, with their place", () => {
  const text = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
  const passages = passagesOf(text);
  assert.ok(passages.length >= 2);
  for (const p of passages) assert.ok(p.text.length <= 600 && p.text.length > 300 || p === passages.at(-1));
  assert.equal(passages[0].start, 0);
  assert.equal(passages[1].start, passages[0].end);
});

test("the search gives the passages with the most of the words first, with the name and the place, at most 3", () => {
  const filler = "Lorem ipsum dolor sit amet consectetur. ".repeat(30);
  const docs = [{ name: "terms.txt", text: `${filler}The refund deadline is 14 days after delivery. ${filler}Shipping takes 3 days. ${filler}` }, { name: "faq.md", text: "Refund questions: ask support. The deadline for a complaint is 2 years." }];
  const out = searchDocuments({ query: "refund deadline" }, docs);
  assert.match(out, /^Passage 1 \(terms\.txt, characters \d+-\d+, matches: refund, deadline\)/);
  assert.match(out, /14 days after delivery/);
  assert.ok((out.match(/^Passage \d/gm) ?? []).length <= DOC_LIMITS.passages);
  assert.ok(out.indexOf("terms.txt") < out.indexOf("faq.md"), "two matching words rank above one");
});

test("the search ignores case and marks, and finds a Czech word by its beginning", () => {
  const docs = [{ name: "cz.txt", text: "Lhůta pro vrácení zboží je čtrnáct dní od převzetí." }];
  assert.match(searchDocuments({ query: "LHUTA" }, docs), /Lhůta pro vrácení/);
  assert.match(searchDocuments({ query: "vrácením zboží" }, docs), /Passage 1/);
});

test("the search says so when nothing matches, and refuses a bad query or no documents, as an error text", () => {
  const docs = [{ name: "a.txt", text: "Cats and dogs." }];
  assert.match(searchDocuments({ query: "refund" }, docs), /No passage matches/);
  assert.throws(() => searchDocuments({}, docs), (e) => e.name === "ToolError");
  assert.throws(() => searchDocuments({ query: "x".repeat(201) }, docs), (e) => e.name === "ToolError");
  assert.throws(() => searchDocuments({ query: "!!" }, docs), (e) => e.name === "ToolError");
  assert.throws(() => searchDocuments({ query: "cats" }, []), (e) => e.name === "ToolError" && /No documents/.test(e.message));
  assert.throws(() => searchDocuments({ query: "cats" }, undefined), (e) => e.name === "ToolError");
});

test("the tool document_search runs through runTool with the documents of the run, and is offered to an agent that has it", async () => {
  const documents = [{ name: "a.txt", text: "The password policy needs 12 characters." }];
  const done = await runTool("document_search", { query: "password" }, { documents });
  assert.equal(done.error, false);
  assert.match(done.output, /12 characters/);
  const none = await runTool("document_search", { query: "password" }, {});
  assert.equal(none.error, true);
  const names = toolsFor({ id: "a", model: "fast", search: false, tools: ["document_search"] }, createBudget(LIMIT_DEFAULTS), "groq").map((x) => x.name);
  assert.deepEqual(names, ["document_search"]);
});

test("a design with documents is checked: good ones pass, too many or too long fail", () => {
  const base = (documents) => ({ pattern: "sequential", nodes: [{ id: "a", agent: "researcher", model: "fast", search: false, tools: ["document_search"] }, { id: "b", agent: "writer", model: "fast", search: false }], edges: [{ from: "a", to: "b" }], ...(documents === undefined ? {} : { documents }) });
  const bad = (documents) => validateDesign(base(documents)).errors.some((e) => e.code === "design.documents");
  assert.equal(bad(undefined), false);
  assert.equal(bad([{ name: "a.txt", text: "hello" }]), false);
  assert.equal(bad([{ name: "a.txt", text: "x".repeat(200001) }]), true);
  assert.equal(bad("text"), true);
  assert.ok(en["design.error.design.documents"] && cs["design.error.design.documents"]);
});

test("the editor keeps the documents in the design, drops the field when none is left, and a definition carries them", () => {
  const editor = createEditor("sequential");
  editor.addNode("researcher");
  assert.equal("documents" in editor.design(), false);
  editor.setDocuments([{ name: "a.txt", text: "hello" }, { name: "bad" }]);
  assert.deepEqual(editor.design().documents, [{ name: "a.txt", text: "hello" }]);
  editor.setDocuments([]);
  assert.equal("documents" in editor.design(), false);
  editor.setDocuments([{ name: "a.txt", text: "hello" }]);
  const file = JSON.stringify(buildDefinition({ task: "t", design: editor.design() }));
  const loaded = loadDefinition(file);
  assert.equal(loaded.ok, true);
  assert.deepEqual(loaded.editor.documents(), [{ name: "a.txt", text: "hello" }]);
});

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.value = ""; this.checked = false; this.disabled = false; this.textContent = ""; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === "checked") this.checked = true; if (k === "disabled") this.disabled = true; if (k === "value") this.value = v; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...n) { this.children.push(...n); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.textContent + this.children.map((c) => c.text).join(" "); }
  async fire(type) { for (const fn of this.listeners[type] ?? []) await fn(); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const ui = (r, name) => r.find((e) => e.attrs["data-ui"] === name)[0];
function setup(node = { tools: ["document_search"] }, readFile) {
  const editor = createEditor("sequential");
  const { id } = editor.addNode("researcher");
  editor.setNode(id, node);
  let changes = 0;
  const draw = () => { const r = new El("div"); r.append(...toolsPane({ doc, t, node: editor.design().nodes.find((n) => n.id === id), editor, changed: () => { changes += 1; }, ...(readFile ? { readFile } : {}) })); return r; };
  return { editor, draw, changes: () => changes };
}

test("the Tools tab shows the documents only for an agent with the search on, and a pasted text is added and removed", async () => {
  assert.equal(ui(setup({}).draw(), "docs-block"), undefined);
  const { editor, draw, changes } = setup();
  let r = draw();
  assert.ok(ui(r, "docs-block"));
  assert.ok(ui(r, "docs-privacy"), "the warning about confidential text");
  ui(r, "doc-paste").value = "A pasted text about refunds.";
  await ui(r, "doc-paste-add").fire("click");
  assert.deepEqual(editor.documents(), [{ name: "Pasted text 1", text: "A pasted text about refunds." }]);
  assert.equal(changes(), 1);
  r = draw();
  assert.match(ui(r, "doc-item-0").text, /Pasted text 1/);
  await ui(r, "doc-remove-0").fire("click");
  assert.deepEqual(editor.documents(), []);
});

test("files are read by the tab: a text file and a web page are added, a pdf is refused with a message that stays after the tab is drawn again", async () => {
  const files = [{ name: "notes.txt", raw: "Refund in 14 days." }, { name: "page.html", raw: "<p>Hello</p>" }, { name: "report.pdf", raw: "%PDF" }];
  const { editor, draw } = setup({ tools: ["document_search"] }, async (file) => files.find((f) => f.name === file.name).raw);
  const r = draw();
  const picker = ui(r, "doc-file");
  picker.files = files.map((f) => ({ name: f.name }));
  await picker.fire("change");
  assert.deepEqual(editor.documents().map((d) => d.name), ["notes.txt", "page.html"]);
  assert.equal(editor.documents()[1].text, "Hello");
  assert.match(ui(r, "docs-status").text, /report\.pdf: this kind of file is not read/);
  assert.match(ui(draw(), "docs-status").text, /report\.pdf/, "the message is kept");
});

test("the tab refuses a fourth document and one that does not fit, and says why", async () => {
  const { editor, draw } = setup();
  editor.setDocuments([1, 2, 3].map((n) => ({ name: `d${n}.txt`, text: "x" })));
  const r = draw();
  ui(r, "doc-paste").value = "more";
  await ui(r, "doc-paste-add").fire("click");
  assert.equal(editor.documents().length, 3);
  assert.match(ui(r, "docs-status").text, /At most 3 documents/);
  const second = setup();
  second.editor.setDocuments([{ name: "big.txt", text: "x".repeat(199999) }]);
  const r2 = second.draw();
  ui(r2, "doc-paste").value = "too long";
  await ui(r2, "doc-paste-add").fire("click");
  assert.equal(second.editor.documents().length, 1);
  assert.match(ui(r2, "docs-status").text, /do(es)? not fit/);
});

test("every text of the documents exists in English and Czech", () => {
  const keys = Object.keys(en).filter((k) => k.startsWith("tools.docs.") || k === "tools.document_search.name" || k === "tools.document_search.what" || k === "insp.doc.document_search");
  assert.ok(keys.length >= 20);
  for (const k of keys) assert.ok(cs[k], `cs ${k}`);
});
