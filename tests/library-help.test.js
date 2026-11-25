import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const EN = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
import { createLibraryHelp, helpWanted, markHelpSeen, HELP_TABS, CARD_PARTS } from "../public/js/library-help.js";

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.parent = null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...nodes) { for (const n of nodes) { if (n instanceof El) n.parent = this; this.children.push(n); } }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  focus() {}
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.textContent ?? this.children.map((c) => c.text).join(" "); }
}
function setup({ libraryHelp = true, items = [] } = {}) {
  const store = new Map();
  const saved = [];
  const docListeners = {};
  const body = new El("body");
  const doc = {
    createElement: (tag) => new El(tag),
    createTextNode: (text) => ({ text }),
    createElementNS: (ns, tag) => new El(tag),
    body,
    activeElement: null,
    addEventListener: (type, fn) => { (docListeners[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { docListeners[type] = (docListeners[type] ?? []).filter((f) => f !== fn); },
    defaultView: { sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) } },
  };
  const settings = { get: () => ({ libraryHelp, providerColors: {} }), setLibraryHelp: (on) => saved.push(on) };
  // The words are the keys, except the ones that hold the {done} marker: those are the real English text, so the icon can be found.
  const t = (k, p) => (EN[k]?.includes("{done}") ? EN[k] : p ? `${k}|${JSON.stringify(p)}` : k);
  const ctx = { doc, t, lang: "en", settings };
  const help = createLibraryHelp(ctx, () => items);
  return { ctx, doc, body, help, saved, docListeners, store };
}
const ui = (root, name) => root.find((e) => e.attrs["data-ui"] === name);

test("the window opens in the body with five sections and closes with the Escape key", () => {
  const { body, help, docListeners } = setup();
  help.open();
  assert.equal(help.isOpen(), true);
  const win = ui(body, "library-help")[0];
  assert.equal(win.attrs.role, "dialog");
  assert.equal(win.attrs["aria-modal"], "true");
  assert.deepEqual(HELP_TABS, ["card", "color", "level", "pairs", "compare"]);
  assert.equal(ui(win, "help-tabs")[0].children.length, 5);
  docListeners.keydown[0]({ key: "Escape", preventDefault() {}, stopPropagation() {} });
  assert.equal(help.isOpen(), false);
  assert.equal(body.children.length, 0);
});

test("the card section points at every part with its own words: two for the providers, one for the background colour, and the step shows the tick icon", () => {
  const { body, help } = setup();
  help.open();
  const panel = ui(body, "help-panel")[0];
  for (const part of CARD_PARTS) assert.equal(ui(panel, `help-label-${part}`).length, 1, part);
  assert.ok(CARD_PARTS.includes("prov1") && CARD_PARTS.includes("prov2") && CARD_PARTS.includes("bg"));
  assert.match(ui(panel, "help-label-bg")[0].text, /libhelp\.p\.bg\.t/);
  const step = ui(panel, "help-label-step")[0];
  assert.equal(ui(step, "help-step-done").length, 1, "the words of the step hold the icon with the tick");
  assert.equal(ui(panel, "run-row").length, 1, "the example is a real card of the library");
});

test("Next walks through the sections and the last one closes the window", () => {
  const { body, help } = setup();
  help.open();
  const win = ui(body, "library-help")[0];
  const next = () => ui(win, "help-next")[0];
  for (let i = 1; i < HELP_TABS.length; i += 1) {
    next().listeners.click[0]();
    assert.equal(ui(win, `help-tab-${HELP_TABS[i]}`)[0].attrs["aria-selected"], "true");
  }
  assert.match(next().textContent, /libhelp\.done/);
  next().listeners.click[0]();
  assert.equal(help.isOpen(), false);
});

test("the colour section shows a green, an amber and a red card", () => {
  const { body, help } = setup();
  help.open();
  ui(body, "help-tab-color")[0].listeners.click[0]();
  const classes = ui(body, "run-row").map((li) => li.attrs.class);
  assert.match(classes[0], /out-ok/);
  assert.match(classes[1], /out-warn/);
  assert.match(classes[2], /out-fail/);
});

test("the pairs section draws the real frames of the library with their own question mark box, from a real pair of the index", () => {
  const items = [
    { id: "save-tokens-4000", title: "A", pattern: "sequential", provider: "anthropic", kind: "pair", twin: "save-tokens-1000", teaches: { en: "Long." } },
    { id: "save-tokens-1000", title: "B", pattern: "sequential", provider: "anthropic", kind: "pair", twin: "save-tokens-4000", teaches: { en: "Short." } },
  ];
  const { body, help } = setup({ items });
  help.open();
  ui(body, "help-tab-pairs")[0].listeners.click[0]();
  const pair = ui(body, "help-pair")[0];
  const frame = ui(pair, "pair-group")[0];
  assert.equal(frame.attrs["data-pair"], "save-tokens-1000");
  assert.equal(ui(frame, "run-row").length, 2);
  assert.match(ui(frame, "pair-tip")[0].attrs.id, /^help-tip-/, "its own id, so the list behind the window keeps its own");
  assert.match(ui(frame, "pair-tip")[0].text, /Long\./);
  assert.equal(ui(ui(body, "help-trio")[0], "run-row").length, 3, "a made-up trio when the index has none");
});

test("the compare section: the button is off until two cards are ticked", () => {
  const { body, help } = setup();
  help.open();
  ui(body, "help-tab-compare")[0].listeners.click[0]();
  const go = () => ui(body, "help-compare-go")[0];
  const ticks = ui(body, "compare-select");
  assert.equal(ticks.length, 3);
  assert.match(go().textContent, /"n":0/);
  ticks[0].checked = true; ticks[0].listeners.change[0]();
  assert.equal(go().disabled, true);
  ticks[1].checked = true; ticks[1].listeners.change[0]();
  assert.equal(go().disabled, false);
  assert.match(go().textContent, /"n":2/);
});

test("Do not show again is the setting: ticking it turns the automatic opening off, unticking it on", () => {
  const { body, help, saved } = setup();
  help.open();
  const never = ui(body, "help-never")[0];
  never.checked = true; never.listeners.change[0]();
  never.checked = false; never.listeners.change[0]();
  assert.deepEqual(saved, [false, true]);
});

test("the window opens by itself once in a browser session and never when the setting is off", () => {
  const on = setup();
  assert.equal(helpWanted(on.ctx), true);
  markHelpSeen(on.ctx);
  assert.equal(helpWanted(on.ctx), false, "seen in this session");
  assert.equal(helpWanted(setup({ libraryHelp: false }).ctx), false, "turned off");
});

test("every word of the help is in English and in Czech, and the setting is in the store", () => {
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  const keys = Object.keys(en).filter((k) => k.startsWith("libhelp.") || k.startsWith("settings.libraryHelp"));
  assert.ok(keys.length > 40);
  for (const key of keys) assert.ok(cs[key], key);
  for (const part of CARD_PARTS) assert.ok(en[`libhelp.p.${part}.t`] && en[`libhelp.p.${part}.d`], part);
  const source = readFileSync(new URL("../public/js/storage/settings.js", import.meta.url), "utf8");
  assert.match(source, /libraryHelp: stored\?\.libraryHelp !== false/);
});
