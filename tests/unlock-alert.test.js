import test from "node:test";
import assert from "node:assert/strict";
import { markUnlockAlert, needsUnlock } from "../public/js/unlock-alert.js";

const vault = (stored, session) => ({ hasStoredKey: () => stored, getSessionKey: () => session });

function fakeMenu() {
  const link = {
    attrs: {},
    children: [],
    setAttribute(k, v) { this.attrs[k] = v; },
    append(c) { this.children.push(c); c.parent = this; },
    querySelector(sel) { return this.children.find((c) => `.${c.attrs.class}` === sel); },
  };
  const doc = {
    querySelector: (sel) => (sel === '.menu a[href="#/settings"]' ? link : null),
    createElement: () => ({ attrs: {}, textContent: "", setAttribute(k, v) { this.attrs[k] = v; }, remove() { link.children = link.children.filter((c) => c !== this); } }),
  };
  return { doc, link };
}

test("a key needs unlocking only when one is saved and not yet unlocked", () => {
  assert.equal(needsUnlock(vault(true, null)), true);
  assert.equal(needsUnlock(vault(true, "sk")), false);
  assert.equal(needsUnlock(vault(false, null)), false);
  assert.equal(needsUnlock(vault(false, "sk")), false);
});

test("the Settings link gets an exclamation mark while a saved key is locked, and loses it after unlocking", () => {
  const { doc, link } = fakeMenu();
  const t = (k) => k;
  markUnlockAlert(doc, vault(true, null), t);
  markUnlockAlert(doc, vault(true, null), t);
  assert.equal(link.children.length, 1);
  assert.equal(link.children[0].textContent, "!");
  assert.equal(link.attrs.title, "settings.unlockAlert");
  markUnlockAlert(doc, vault(true, "sk"), t);
  assert.equal(link.children.length, 0);
});
