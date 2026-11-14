import { test } from "node:test";
import assert from "node:assert/strict";
import { providerChips } from "../public/js/provider-colors.js";

test("a mixed run gets one chip per provider in its color", () => {
  const chips = providerChips("anthropic+google", { google: "#2e9e6b" });
  assert.deepEqual(chips.map((c) => c.name), ["Anthropic", "Gemini"]);
  assert.equal(chips[0].background, "#d97757");
  assert.equal(chips[1].background, "#2e9e6b");
});

test("no provider gives no chips and an unknown provider a grey one", () => {
  assert.deepEqual(providerChips(undefined), []);
  assert.equal(providerChips("acme")[0].name, "Acme");
});

import { deriveInspector } from "../public/js/replay/inspect-model.js";

test("a warning keeps the clock time it happened at", () => {
  const events = [
    { type: "run_start", t: 0, agents: [] },
    { type: "warning", t: 10, message: "busy", at: 1700000000000 },
    { type: "warning", t: 20, message: "older run" },
  ];
  const state = deriveInspector(events);
  assert.deepEqual(state.warnings, ["busy", "older run"]);
  assert.deepEqual(state.warningTimes, [1700000000000, null]);
});

import { mergeGoKeys, DEFAULT_GO_KEYS, DESTINATIONS, createKeyHandler } from "../public/js/shortcuts.js";
import { splitTopics } from "../public/js/help-page.js";

test("new GitHub shortcuts get free letters even when old saved letters use theirs", () => {
  const old = { play: "p", create: "c", result: "r", learn: "l", help: "h", about: "a", settings: "s", home: "0" };
  assert.deepEqual(mergeGoKeys(old).bug, "b");
  const clash = { ...old, learn: "b" };
  const merged = mergeGoKeys(clash);
  assert.equal(merged.learn, "b");
  assert.notEqual(merged.bug, "b");
  assert.equal(new Set(Object.values(merged)).size, Object.keys(DEFAULT_GO_KEYS).length);
});

test("g then b hands the GitHub bug form to go", () => {
  const seen = [];
  const handle = createKeyHandler({ isEnabled: () => true, go: (x) => seen.push(x), showHelp() {}, focusSearch() {}, confirmStop() {} });
  const press = (key) => handle({ key, target: { tagName: "BODY" } });
  press("g");
  press("b");
  assert.deepEqual(seen, [DESTINATIONS.bug]);
  assert.match(DESTINATIONS.bug, /^https:\/\/github\.com\/.+template=bug_report\.md$/);
});

test("a help topic can name itself with {#id}", () => {
  const topics = splitTopics("## One\n\na\n\n## Bugs and ideas {#bugs}\n\nb");
  assert.deepEqual(topics.map((t) => [t.title, t.id]), [["One", undefined], ["Bugs and ideas", "bugs"]]);
});

import { submitLink, canSubmit, SUBMIT_EMAIL } from "../public/js/submit-run.js";

test("the submit mail goes to the contact address and names the file to attach", () => {
  const t = (key, p = {}) => ({ "submit.subject": `Subject ${p.title}`, "submit.body": `Attach ${p.file}\nThanks` })[key];
  const link = submitLink(t, { title: "Sky & light" }, "run-1.json");
  assert.ok(link.startsWith(`mailto:${SUBMIT_EMAIL}?subject=`));
  assert.ok(link.includes(encodeURIComponent("Subject Sky & light")));
  assert.ok(link.includes(encodeURIComponent("Attach run-1.json\r\nThanks")));
});

test("only a finished run with events can be submitted", () => {
  assert.equal(canSubmit({ outcome: "finished", events: [{}] }), true);
  assert.equal(canSubmit({ outcome: "failed", events: [{}] }), false);
  assert.equal(canSubmit({ outcome: "finished", events: [] }), false);
});
