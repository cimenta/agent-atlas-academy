import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { systemPromptFor, WEB_DATA_RULE } from "../public/js/engine/prompts.js";
import { findSection } from "../public/js/help-topics.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { warningHelp } from "../public/js/help-ids.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));

const design = { pattern: "sequential", nodes: [{ id: "a", agent: "researcher", model: "fast", search: true }], edges: [] };
const reply = { content: [{ type: "text", text: "done" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } };

async function run(allowSearch) {
  const bodies = [];
  const events = [];
  await runDesign({ design, task: "t", limits: {}, call: async (body) => { bodies.push(body); return reply; }, emit: (e) => events.push(e), allowSearch });
  return { bodies, events };
}

test("with web search allowed an agent that has the switch on is given the tool", async () => {
  const { bodies, events } = await run(true);
  assert.ok(bodies[0].tools?.length > 0);
  assert.ok(!events.some((e) => e.webSearchOff));
});

test("with web search forbidden no agent is given the tool and the replay says so", async () => {
  const { bodies, events } = await run(false);
  assert.ok(!bodies[0].tools || bodies[0].tools.length === 0);
  const warning = events.find((e) => e.type === "warning" && e.webSearchOff);
  assert.ok(warning);
  assert.match(warning.message, /Settings, Harness, Tools/);
  assert.equal(warningHelp(warning), "harness-web-search");
});

test("an agent that can search is told that web text is data, and one that cannot is not", () => {
  assert.ok(systemPromptFor({ agent: "researcher", search: true }).includes(WEB_DATA_RULE));
  assert.ok(!systemPromptFor({ agent: "researcher", search: false }).includes(WEB_DATA_RULE));
});

test("the web search setting is on unless turned off and is kept", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const store = createSettingsStore(storage);
  assert.equal(store.get().webSearch, true);
  store.setWebSearch(false);
  assert.equal(createSettingsStore(storage).get().webSearch, false);
});

test("the new help sections and texts exist in both languages", () => {
  for (const id of ["harness-web-search", "harness-web-content", "create-tools", "replay-web-content"]) {
    for (const [lang, locale] of [["en", en], ["cs", cs]]) {
      const found = findSection(locale["help.body"], id);
      assert.ok(found, `${lang}: ${id}`);
      for (const rid of found.section.related) assert.ok(findSection(locale["help.body"], rid), `${lang}: ${id} -> ${rid}`);
    }
  }
  for (const k of ["harness.tabTools", "harness.toolsHeading", "harness.toolsIntro", "harness.webSearchLabel", "harness.webContentHeading", "harness.webContentLabel", "harness.alwaysOn", "harness.webContentNote", "editor.toolsHeading", "editor.toolsNote", "editor.searchOffInSettings", "insp.untrusted"]) assert.ok(en[k] && cs[k], k);
});
