import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrontMatter, parseMarkdown, isSafeHref } from "../public/js/markdown.js";
import { renderBlocks } from "../public/js/render.js";

function fakeDocument() {
  const make = (tag) => ({
    tag,
    children: [],
    attrs: {},
    text: "",
    appendChild(child) {
      this.children.push(child);
      return child;
    },
    setAttribute(key, value) {
      this.attrs[key] = value;
    },
    set textContent(value) {
      this.text = value;
    },
    get textContent() {
      return this.text;
    },
  });
  return {
    createElement: (tag) => make(tag),
    createTextNode: (text) => ({ tag: "#text", text }),
    createDocumentFragment: () => make("#fragment"),
  };
}

function collect(node, out = []) {
  out.push(node);
  for (const child of node.children || []) collect(child, out);
  return out;
}

test("parses front matter with array values", () => {
  const { meta, body } = parseFrontMatter("---\ntitle: Hi\nrelated: [a, b]\n---\nBody");
  assert.equal(meta.title, "Hi");
  assert.deepEqual(meta.related, ["a", "b"]);
  assert.equal(body.trim(), "Body");
});

test("front matter absent returns whole text as body", () => {
  const { meta, body } = parseFrontMatter("Just text");
  assert.deepEqual(meta, {});
  assert.equal(body, "Just text");
});

test("front matter with Windows line endings parses", () => {
  const { meta, body } = parseFrontMatter("---\r\ntitle: Hi\r\n---\r\nBody");
  assert.equal(meta.title, "Hi");
  assert.equal(body.trim(), "Body");
});

test("headings, paragraphs and lists parse", () => {
  const blocks = parseMarkdown("# T\n\nOne **bold** and *it*.\n\n- a\n- b");
  assert.equal(blocks[0].type, "heading");
  assert.equal(blocks[0].level, 1);
  assert.equal(blocks[1].type, "paragraph");
  const kinds = blocks[1].inlines.map((i) => i.type);
  assert.ok(kinds.includes("strong"));
  assert.ok(kinds.includes("em"));
  assert.equal(blocks[2].type, "list");
  assert.equal(blocks[2].ordered, false);
  assert.equal(blocks[2].items.length, 2);
});

test("ordered lists and code blocks parse", () => {
  const blocks = parseMarkdown("1. one\n2. two\n\n```\nlet x = 1;\n```");
  assert.equal(blocks[0].ordered, true);
  assert.equal(blocks[0].items.length, 2);
  assert.equal(blocks[1].type, "code");
  assert.equal(blocks[1].text, "let x = 1;");
});

test("raw html stays text", () => {
  const blocks = parseMarkdown("<script>alert(1)</script>");
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "paragraph");
  assert.deepEqual(blocks[0].inlines, [{ type: "text", text: "<script>alert(1)</script>" }]);
});

test("unsafe links become text and safe links stay links", () => {
  const unsafe = parseMarkdown("[x](javascript:alert(1))")[0].inlines;
  assert.ok(!unsafe.some((i) => i.type === "link"));
  assert.ok(unsafe.some((i) => i.type === "text" && i.text.includes("x")));
  const safe = parseMarkdown("[ok](https://example.com)")[0].inlines;
  assert.deepEqual(safe, [{ type: "link", text: "ok", href: "https://example.com" }]);
  const hash = parseMarkdown("[in](#/learn)")[0].inlines;
  assert.equal(hash[0].type, "link");
});

test("isSafeHref accepts only http, https and hash routes", () => {
  assert.equal(isSafeHref("https://example.com/a"), true);
  assert.equal(isSafeHref("http://example.com"), true);
  assert.equal(isSafeHref("#/learn/tools"), true);
  for (const bad of ["javascript:x", "data:text/html,x", "//evil.com", "", "/relative", "https://a b"]) {
    assert.equal(isSafeHref(bad), false, bad);
  }
});

test("renderBlocks never creates a script element and hardens links", () => {
  const blocks = parseMarkdown("<script>alert(1)</script>\n\n[ok](https://example.com)");
  const doc = fakeDocument();
  const fragment = renderBlocks(blocks, doc);
  const nodes = collect(fragment);
  assert.ok(!nodes.some((n) => n.tag === "script"));
  assert.ok(nodes.some((n) => n.tag === "#text" && n.text === "<script>alert(1)</script>"));
  const link = nodes.find((n) => n.tag === "a");
  assert.equal(link.attrs.rel, "noopener noreferrer");
  assert.equal(link.attrs.href, "https://example.com");
});
