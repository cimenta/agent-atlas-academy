import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("../public/styles.css");
const start = css.indexOf("/* Create steps */");
const end = css.indexOf("/* end Create steps */");
const block = start >= 0 && end > start ? css.slice(start, end) : "";

test("the styles of the Create steps are in one marked block", () => {
  assert.ok(block.length > 0, "no Create steps block in styles.css");
});

test("every class the Create steps use is styled", () => {
  for (const cls of [".step-bar", ".step-tab", ".st[", ".step-footer", ".step-hint", ".inner-tabs", ".inner-tab", ".part-heading", ".part-extra", ".agents-table", ".memory-button", ".provider-row", ".pattern-choice:not(.describe)", ".step-nav:disabled"]) {
    assert.ok(block.includes(cls), `missing ${cls}`);
  }
  for (const state of ["none", "part", "done", "lock"]) assert.ok(block.includes(`data-s="${state}"`), `no status icon style for ${state}`);
});

test("the Create steps use colour variables only, so dark mode works", () => {
  assert.doesNotMatch(block, /#[0-9a-fA-F]{3,8}\b/);
});

test("the Create steps have a rule for narrow screens", () => {
  assert.match(block, /@media \(max-width: 640px\)/);
});

test("the Create step code sets no inline styles", () => {
  for (const f of ["../public/js/create/steps-view.js", "../public/js/create/create-page.js"]) assert.doesNotMatch(read(f), /\bstyle\s*[:=]/, f);
});

test("the workspace layout is styled and collapses to one column on a narrow screen", () => {
  for (const cls of [".workspace-bar", ".ws ", ".right-col", ".lockmsg"]) assert.ok(block.includes(cls), `missing ${cls}`);
  assert.match(block, /@media \(max-width: 860px\)[^}]*\.ws \{ grid-template-columns: 1fr/);
});
