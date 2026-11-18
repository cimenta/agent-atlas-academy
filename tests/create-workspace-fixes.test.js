import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { workspaceEstimateUsd } from "../public/js/create/steps-model.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const css = read("../public/styles.css");
const block = css.slice(css.indexOf("/* Create steps */"), css.indexOf("/* end Create steps */"));

test("the agents table scrolls inside the right column of the workspace instead of widening the page", () => {
  assert.match(block, /\.right-col \.agents-table \{[^}]*overflow-x: auto/);
});

test("the bar estimate includes the search fee", () => {
  assert.equal(workspaceEstimateUsd({ costUsd: 0.02, searchCostUsd: 0.03, totalUsd: 0.05 }), "0.050");
  assert.equal(workspaceEstimateUsd({ costUsd: 0.0123 }), "0.012");
});

test("the review sits in the column without a card of its own, and the lock box has a shadow", () => {
  assert.match(block, /\.right-col \.review \{[^}]*border: 0/);
  assert.match(block, /\.lockmsg div \{[^}]*box-shadow/);
});

test("the workspace bar chip says Check and the agent count is shown", () => {
  const source = read("../public/js/create/steps-view.js");
  assert.match(source, /create\.ws\.check/);
  assert.match(source, /workspace-agents/);
  for (const l of ["en", "cs"]) assert.ok(JSON.parse(read(`../public/locales/${l}.json`))["create.ws.check"], l);
});

test("the workspace keeps the review (tabs, key, limits) in the right column and does not move it into the hidden check panel", () => {
  const source = read("../public/js/create/create-page.js");
  assert.match(source, /if \(!workspace\) panels\.check\.replaceChildren\(reviewHost\);/);
});
