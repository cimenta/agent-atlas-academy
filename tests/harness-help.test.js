import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openHelpPopup } from "../public/js/help-popup.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
const ids = ["profile", "steps", "tokens", "searches", "output", "timeout", "retries", "retryDelay", "cost", "repeat", "handoff"];

test("every setting of the harness has a help text and a label in both languages", () => {
  for (const id of ids) {
    assert.ok(en[`harness.help.${id}`]?.length > 40, `en help ${id}`);
    assert.ok(cs[`harness.help.${id}`]?.length > 40, `cs help ${id}`);
    if (id !== "profile") {
      assert.ok(en[`harness.limit.${id}.label`], `en label ${id}`);
      assert.ok(cs[`harness.limit.${id}.label`], `cs label ${id}`);
    }
  }
  for (const k of ["harness.tabLimits", "harness.tabRetries", "harness.tabCost", "harness.tabGuards", "harness.help.open", "harness.help.close"]) {
    assert.ok(en[k] && cs[k], k);
  }
});

test("the help popup shows the title and one paragraph for each blank line, and closes", () => {
  const nodes = [];
  const make = (tag) => {
    const el = { tag, children: [], attrs: {}, listeners: {}, textContent: "", remove() { this.removed = true; }, setAttribute(k, v) { this.attrs[k] = v; }, append(...c) { this.children.push(...c); }, addEventListener(type, fn) { this.listeners[type] = fn; }, focus() {} };
    nodes.push(el);
    return el;
  };
  const listeners = {};
  const doc = { body: make("body"), createElement: make, createTextNode: (text) => ({ text }), addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; } };
  const popup = openHelpPopup({ doc, t: (k) => k, title: "Maximum steps", body: "one\n\ntwo\n\nthree" });
  const dialog = doc.body.children[0];
  assert.equal(dialog.attrs["aria-label"], "Maximum steps");
  assert.equal(nodes.filter((n) => n.tag === "p").length, 3);
  assert.ok(listeners.keydown);
  listeners.keydown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(dialog.removed, true);
  assert.equal(listeners.keydown, undefined);
  popup.close();
});
