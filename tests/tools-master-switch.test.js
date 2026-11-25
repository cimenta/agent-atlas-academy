import { test } from "node:test";
import assert from "node:assert/strict";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { startRun } from "../public/js/run-client.js";
import { warningHelp } from "../public/js/help-ids.js";

const reply = { content: [{ type: "text", text: "done" }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } };
const design = { pattern: "sequential", nodes: [{ id: "a", agent: "researcher", model: "fast", search: false, tools: ["calculator"] }], edges: [] };

async function run(allowTools) {
  const bodies = [];
  const events = [];
  await runDesign({ design, task: "t", limits: {}, call: async (body) => { bodies.push(body); return reply; }, emit: (e) => events.push(e), allowTools });
  return { bodies, events };
}

test("the switch for the tools of our own is on unless turned off, and is kept", () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const store = createSettingsStore(storage);
  assert.equal(store.get().ownTools, true);
  store.setOwnTools(false);
  assert.equal(createSettingsStore(storage).get().ownTools, false);
  store.setOwnTools(true);
  assert.equal(createSettingsStore(storage).get().ownTools, true);
});

test("with the tools allowed an agent is given the tools it has switched on", async () => {
  const { bodies, events } = await run(true);
  assert.deepEqual(bodies[0].tools.map((t) => t.name), ["calculator"]);
  assert.ok(!events.some((e) => e.toolsOff));
});

test("with the tools forbidden no agent is given a tool of ours and the replay says so", async () => {
  const { bodies, events } = await run(false);
  assert.ok(!bodies[0].tools || bodies[0].tools.length === 0);
  const warning = events.find((e) => e.type === "warning" && e.toolsOff);
  assert.ok(warning);
  assert.match(warning.message, /Settings, Harness, Tools/);
  assert.equal(warningHelp(warning), "harness-web-search");
  assert.deepEqual(events.find((e) => e.type === "agent_start").tools, []);
});

test("the run request says so only when the tools are forbidden", async () => {
  const sent = [];
  const fetchFn = async (url, init) => {
    sent.push(JSON.parse(init.body));
    return { ok: false, status: 500, body: null, json: async () => ({}) };
  };
  const send = (ownTools) => startRun({ design, task: "t", limits: {}, language: "en", apiKey: "k", ownTools, fetchFn, onEvent: () => {} }).done?.catch?.(() => {});
  await send(false);
  await send(true);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(sent[0].ownTools, false);
  assert.equal("ownTools" in sent[1], false);
});
