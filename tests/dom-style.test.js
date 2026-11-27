import { test } from "node:test";
import assert from "node:assert/strict";
import { h, parseStyle } from "../public/js/dom.js";

// The CSP has no unsafe-inline, so a style attribute would be dropped: h() must set styles one property at a time.
function fakeDoc() {
  const make = (name) => ({
    name,
    attrs: {},
    props: {},
    style: { setProperty(k, v) { this.owner.props[k] = v; } },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    append() {},
  });
  return { createElement: (n) => { const el = make(n); el.style.owner = el; return el; }, createTextNode: (t) => ({ t }) };
}

test("a style given to h() is applied property by property, never as an attribute", () => {
  const el = h(fakeDoc(), "span", { class: "a", style: "left:10%;width:4.5%;--p:100%" });
  assert.deepEqual(el.props, { left: "10%", width: "4.5%", "--p": "100%" });
  assert.equal(el.attrs.style, undefined);
  assert.equal(el.attrs.class, "a");
});

test("parseStyle keeps a ; or , inside brackets and handles gradients", () => {
  assert.deepEqual(parseStyle("background-image:linear-gradient(to bottom,var(--a),var(--b));background-size:5px 100%"), [["background-image", "linear-gradient(to bottom,var(--a),var(--b))"], ["background-size", "5px 100%"]]);
  assert.deepEqual(parseStyle("margin:0"), [["margin", "0"]]);
  assert.deepEqual(parseStyle(""), []);
});

test("an element without a style object (a test double) still gets the attribute", () => {
  const el = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, append() {} };
  const doc = { createElement: () => el, createTextNode: (t) => t };
  h(doc, "div", { style: "margin:0" });
  assert.equal(el.attrs.style, "margin:0");
});
