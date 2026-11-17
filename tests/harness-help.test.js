import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openHelpPopup, helpIcon } from "../public/js/help-popup.js";
import { splitTopics, findSection } from "../public/js/help-topics.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
const ids = ["profile", "steps", "tokens", "searches", "output", "timeout", "retries", "retry-delay", "cost", "repeat", "handoff"];

test("splitTopics reads sections and related lines and keeps title, id and text", () => {
  const md = "## Topic {#topic}\n\nIntro.\n\n### First {#first}\n\nBody one.\n\n{related: second, third}\n\n### Second {#second}\n\nBody two.\n\n## Other\n\nText.";
  const topics = splitTopics(md);
  assert.equal(topics.length, 2);
  assert.equal(topics[0].id, "topic");
  assert.equal(topics[1].id, undefined);
  assert.deepEqual(topics[0].sections.map((s) => s.id), ["first", "second"]);
  assert.deepEqual(topics[0].sections[0].related, ["second", "third"]);
  assert.equal(topics[0].sections[0].text, "Body one.");
  assert.ok(!topics[0].text.includes("{related"));
  assert.ok(topics[0].text.includes("### First"));
  assert.equal(findSection(md, "second").topic.title, "Topic");
  assert.equal(findSection(md, "nope"), null);
});

test("every ? of the harness points at a section of Help, and so does every related one, in both languages", () => {
  for (const [lang, locale] of [["en", en], ["cs", cs]]) {
    for (const id of ids) {
      const found = findSection(locale["help.body"], `harness-${id}`);
      assert.ok(found, `${lang}: missing section harness-${id}`);
      assert.ok(found.section.text.length > 40, `${lang}: short text ${id}`);
      assert.ok(found.section.related.length > 0, `${lang}: no related for ${id}`);
      for (const rid of found.section.related) assert.ok(findSection(locale["help.body"], rid), `${lang}: ${id} relates to missing ${rid}`);
    }
  }
  for (const id of ids.filter((x) => x !== "profile")) {
    const key = `harness.limit.${id.replace(/-(.)/g, (_, c) => c.toUpperCase())}.label`;
    assert.ok(en[key] && cs[key], key);
  }
  for (const k of ["harness.tabLimits", "harness.tabRetries", "harness.tabCost", "harness.tabGuards", "help.popup.open", "help.popup.close", "help.popup.related", "help.popup.from", "help.popup.more"]) {
    assert.ok(en[k] && cs[k], k);
  }
  assert.equal(en["harness.help.steps"], undefined);
});

function fakeDoc() {
  const listeners = {};
  const make = (tag) => {
    const el = {
      tag, children: [], attrs: {}, listeners: {}, textContent: "", classList: { add() {} },
      remove() { this.removed = true; },
      setAttribute(k, v) { this.attrs[k] = v; },
      append(...c) { this.children.push(...c); },
      appendChild(c) { this.children.push(c); return c; },
      replaceChildren(...c) { this.children = c; },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      querySelector(sel) { return find(this, sel); },
      focus() {},
    };
    return el;
  };
  const walk = (node, fn) => {
    if (!node || typeof node !== "object") return;
    fn(node);
    for (const c of node.children ?? []) walk(c, fn);
  };
  const find = (root, sel) => {
    const m = /\[data-ui=([^\]]+)\]/.exec(sel);
    let hit = null;
    walk(root, (n) => { if (!hit && m && n.attrs?.["data-ui"] === m[1]) hit = n; });
    return hit;
  };
  const doc = { body: make("body"), createElement: make, createDocumentFragment: () => make("fragment"), createTextNode: (text) => ({ text }), addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; } };
  return { doc, listeners, walk };
}

test("the help popup shows a section of Help with its title, related chips and a link, and closes", () => {
  const { doc, listeners, walk } = fakeDoc();
  const t = (k, v) => (k === "help.body" ? en["help.body"] : v ? `${k}:${JSON.stringify(v)}` : k);
  const popup = openHelpPopup({ doc, t, id: "harness-steps" });
  const dialog = doc.body.children[0];
  assert.equal(dialog.attrs["aria-label"], "Maximum steps");
  const seen = [];
  walk(dialog, (n) => seen.push(n));
  assert.ok(seen.some((n) => n.attrs?.["data-ui"] === "help-related-harness-tokens"), "related chip");
  assert.ok(seen.some((n) => n.attrs?.href === "#/help/harness-steps"), "link to Help");
  assert.ok(seen.some((n) => n.tag === "p"), "paragraphs");
  assert.ok(listeners.keydown);
  listeners.keydown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(dialog.removed, true);
  assert.equal(listeners.keydown, undefined);
  popup.close();
});

test("a related chip swaps the popup to that section, and an unknown id opens nothing", () => {
  const { doc, walk } = fakeDoc();
  const t = (k, v) => (k === "help.body" ? en["help.body"] : v ? `${k}` : k);
  openHelpPopup({ doc, t, id: "harness-steps" });
  const dialog = doc.body.children[0];
  let chip = null;
  walk(dialog, (n) => { if (n.attrs?.["data-ui"] === "help-related-harness-tokens") chip = n; });
  chip.listeners.click();
  let title = null;
  walk(dialog, (n) => { if (n.tag === "h2") title = n; });
  assert.ok(dialog.children.length === 1);
  assert.equal(openHelpPopup({ doc, t, id: "harness-nope" }), null);
  assert.equal(doc.body.children.length, 1);
  assert.ok(title);
});

test("helpIcon makes a ? button named for the setting that opens the popup", () => {
  const { doc } = fakeDoc();
  const t = (k, v) => (k === "help.body" ? en["help.body"] : v ? `${k}:${v.name}` : k);
  const icon = helpIcon({ doc, t, id: "harness-cost", name: "Cost cap" });
  assert.equal(icon.attrs["aria-label"], "help.popup.open:Cost cap");
  assert.equal(icon.attrs["data-ui"], "help-harness-cost");
  icon.listeners.click();
  assert.equal(doc.body.children.length, 1);
});
