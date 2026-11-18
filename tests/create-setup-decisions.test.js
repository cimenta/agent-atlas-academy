import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { toggleSlot, modelValid } from "../public/js/create/steps-model.js";
import { createEditor } from "../public/js/create/editor-model.js";

const ORDER = ["anthropic", "google-free", "google"];
const free = (slot) => (slot === "google-free" ? [{ key: "fast" }, { key: "balanced" }] : [{ key: "fast" }, { key: "balanced" }, { key: "strong" }]);

test("switching a provider on adds it in the usual order, switching it off removes it, and none may stay on", () => {
  assert.deepEqual(toggleSlot([], "google", ORDER), ["google"]);
  assert.deepEqual(toggleSlot(["google"], "anthropic", ORDER), ["anthropic", "google"]);
  assert.deepEqual(toggleSlot(["anthropic", "google"], "anthropic", ORDER), ["google"]);
  assert.deepEqual(toggleSlot(["anthropic"], "anthropic", ORDER), []);
});

test("a default model is valid only while its provider is on and still offers it", () => {
  assert.equal(modelValid({ slot: "anthropic", model: "fast" }, ["anthropic"], free), true);
  assert.equal(modelValid({ slot: "anthropic", model: "fast" }, ["google"], free), false);
  assert.equal(modelValid({ slot: "google-free", model: "strong" }, ["google-free"], free), false);
  assert.equal(modelValid(null, ["anthropic"], free), false);
  assert.equal(modelValid({ slot: "anthropic", model: "fast" }, [], free), false);
});

test("an agent whose provider was switched off goes back to the default model", () => {
  const e = createEditor("sequential");
  e.setDefaultModel({ slot: "anthropic", model: "fast" });
  const { id } = e.addNode("planner");
  e.setNodeModel(id, { slot: "google", model: "balanced" });
  assert.equal(e.design().nodes[0].slot, "google");
  e.keepSlots((n) => n.slot === "anthropic");
  assert.equal(e.design().nodes[0].slot, "anthropic");
  assert.equal(e.design().nodes[0].model, "fast");
});

test("Create keeps the two strings that carry the limits you typed", () => {
  const source = readFileSync(new URL("../public/js/create/create-page.js", import.meta.url), "utf8");
  assert.match(source, /draft\.limits === null \|\| !draft\.limitsEdited/);
  assert.match(source, /draft\.limitsEdited = true/);
});
