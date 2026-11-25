import test from "node:test";
import assert from "node:assert/strict";
import { createLibrary } from "../public/js/skill-library.js";
import { pickerView, composedView, approxTokens } from "../public/js/skills-picker.js";
import { skillsPane } from "../public/js/create/skills-pane.js";

class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.value = ""; this.checked = false; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === "checked") this.checked = true; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...nodes) { this.children.push(...nodes); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(" "); }
  fire(type) { for (const fn of this.listeners[type] ?? []) fn(); }
}
const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }) };
const t = (k, p) => (p ? `${k}|${Object.values(p).join(",")}` : k);
const ui = (root, name) => root.find((e) => e.attrs["data-ui"] === name)[0];
const lib = createLibrary([{ id: "mine", name: "Mine", kind: "styl", text: "Mine text." }]);
const empty = { role: "", postup: "", styles: [], params: {} };

test("a longer text has more tokens, and other scripts count more than plain letters", () => {
  assert.ok(approxTokens("a".repeat(400)) > approxTokens("a".repeat(40)));
  assert.ok(approxTokens("ก".repeat(40)) > approxTokens("a".repeat(40)));
});

test("the composed view says when nothing is chosen and shows every part and the tokens otherwise", () => {
  assert.equal(composedView({ doc, t, lib, selection: empty }).attrs["data-ui"], "skills-none");
  const view = composedView({ doc, t, lib, selection: { ...empty, role: "critic", styles: ["mine"] } });
  assert.match(view.text, /You are a critic/);
  assert.match(view.text, /Mine text\./);
  assert.ok(ui(view, "skills-tokens"));
});

test("choosing a role in the picker tells the caller the new choice", () => {
  let got;
  const root = pickerView({ doc, t, lib, selection: empty, onChange: (sel) => { got = sel; } });
  const select = ui(root, "skills-role");
  select.value = "critic";
  select.fire("change");
  assert.equal(got.role, "critic");
});

test("ticking a style and picking a culture reach the caller", () => {
  let got;
  const root = pickerView({ doc, t, lib, selection: { ...empty, styles: ["business"] }, onChange: (sel) => { got = sel; } });
  const culture = ui(root, "skills-culture-business");
  assert.ok(culture, "a style with a culture has the choice of it");
  culture.value = "th";
  culture.fire("change");
  assert.equal(got.params.business, "th");
  const box = ui(root, "skills-style-mine");
  box.checked = true;
  box.fire("change");
  assert.deepEqual(got.styles, ["business", "mine"]);
});

test("the agent pane offers going back to the defaults only when the skills differ from them", () => {
  const same = skillsPane({ doc, t, node: { id: "a", skills: undefined }, lib, startEntries: [], onSet() {} });
  const hidden = (nodes) => nodes.flatMap((n) => (n.find ? [n, ...n.find(() => true)] : [])).find((e) => e.attrs?.["data-ui"] === "skills-reset");
  assert.ok("hidden" in hidden(same).attrs);
  let set;
  const changed = skillsPane({ doc, t, node: { id: "a", skills: [{ id: "critic", kind: "role", name: "Critic", text: "x" }] }, lib, startEntries: [], onSet: (v) => { set = v; } });
  const back = hidden(changed);
  assert.ok(!("hidden" in back.attrs));
  back.fire("click");
  assert.equal(set, null, "going back to no defaults removes the skills");
});
