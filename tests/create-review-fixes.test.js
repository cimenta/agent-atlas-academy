import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draft, openInCreate, resetForLoad, showKeyStep } from "../public/js/create/draft.js";
import { definitionFromRun } from "../public/js/create/definition.js";
import { loadDefinition } from "../public/js/create/definition.js";
import { setDefaultKeepingAgents, emptyDecisions } from "../public/js/create/steps-model.js";
import { providerCatalog } from "../public/js/engine/catalog.js";
import { slotProvider } from "../public/js/key-slots.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const run = (name) => JSON.parse(read(`../public/runs/${name}.json`));

test("the status icon style of the steps never styles the chips of the player", () => {
  const css = read("../public/styles.css");
  const block = css.slice(css.indexOf("/* Create steps */"), css.indexOf("/* end Create steps */"));
  for (const line of block.split("\n")) {
    const selectors = line.split("{")[0];
    for (const s of selectors.split(",")) if (/\.st\b/.test(s)) assert.match(s, /\.st\[data-s/, `bare .st selector: ${s.trim()}`);
  }
});

test("Use in Create forgets the providers chosen earlier, so the agents keep their own", () => {
  draft.slots = ["anthropic"];
  draft.step = "diagram";
  const doc = { defaultView: { location: { hash: "" }, confirm: () => true } };
  assert.equal(openInCreate(doc, (k) => k, definitionFromRun(run("sequential-simple"))), true);
  assert.equal(draft.slots, null);
  assert.equal(draft.step, "setup");
});

test("loading a definition drops the limit decisions of the earlier work", () => {
  Object.assign(draft.decisions.limits, { maxSteps: false, maxTokens: false });
  draft.limitsEdited = true;
  draft.slots = ["anthropic"];
  resetForLoad();
  assert.deepEqual(draft.decisions.limits, emptyDecisions().limits);
  assert.equal(draft.limitsEdited, false);
  assert.equal(draft.limits, null);
  assert.equal(draft.slots, null);
});

test("a retry that needs a key opens the key tab of step 3", () => {
  draft.step = "setup";
  draft.subTab = "agents";
  showKeyStep();
  assert.equal(draft.step, "check");
  assert.equal(draft.subTab, "key");
});

test("giving a loaded definition a default model keeps the model of each of its agents", () => {
  const loaded = loadDefinition(JSON.stringify(definitionFromRun(run("debate-complex"))));
  assert.equal(loaded.ok, true);
  const editor = loaded.editor;
  const before = editor.design().nodes.map((n) => n.model);
  assert.ok(new Set(before).size > 1, "the run needs agents with different models");
  const modelsOf = (slot) => providerCatalog(slotProvider(slot)).models;
  const slots = [...new Set(editor.design().nodes.map((n) => n.slot).filter(Boolean))];
  const slot = slots[0] ?? "anthropic";
  setDefaultKeepingAgents(editor, { slot, model: "fast" }, (n) => [slot, ...slots].includes(n.slot) && modelsOf(n.slot).some((m) => m.key === n.model));
  assert.deepEqual(editor.design().nodes.map((n) => n.model), before);
});

test("Create offers only the providers that are set up, and says so when there is none", () => {
  const source = read("../public/js/create/create-page.js");
  assert.ok(source.includes('keyState(vaultFor(id)) !== "none"'));
  assert.match(source, /create.noProviders/);
  for (const l of ["en", "cs"]) assert.ok(JSON.parse(read(`../public/locales/${l}.json`))["create.noProviders"]);
});

test("the limits start decided, with the values of Settings", () => {
  assert.deepEqual(emptyDecisions().limits, { maxSteps: true, maxTokens: true, maxSearches: true });
  const source = read("../public/js/create/create-page.js");
  assert.doesNotMatch(source, /value: decided ? limits[key] : ""/);
});
