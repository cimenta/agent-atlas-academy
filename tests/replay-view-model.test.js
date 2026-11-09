import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deriveState } from "../public/js/replay/state.js";
import { EVENT_TYPES } from "../public/js/run-schema.js";
import {
  buildGraphModel,
  buildTimelineModel,
  describeStep,
  stepMessage,
} from "../public/js/replay/view-model.js";

const here = dirname(fileURLToPath(import.meta.url));
const events = JSON.parse(readFileSync(join(here, "fixtures", "sample-run.json"), "utf8")).events;
const locale = (lang) => JSON.parse(readFileSync(join(here, "..", "public", "locales", `${lang}.json`), "utf8"));

test("the graph marks the working agent active and keeps statuses", () => {
  const model = buildGraphModel(deriveState(events, 6));
  assert.deepEqual(
    model.nodes.map((n) => [n.id, n.status, n.active]),
    [
      ["planner", "done", false],
      ["researcher", "working", true],
      ["writer", "waiting", false],
    ],
  );
});

test("the graph at the start has no active node", () => {
  const model = buildGraphModel(deriveState(events, 0));
  assert.ok(model.nodes.every((n) => n.active === false));
});

test("the timeline marks exactly one current item once the replay has started", () => {
  const items = buildTimelineModel(events, 4, {}).items;
  assert.equal(items.length, 4);
  assert.equal(items.filter((i) => i.current).length, 1);
  assert.equal(items[3].current, true);
  assert.equal(buildTimelineModel(events, 0, {}).items.length, 0);
});

test("an explanation appears on the item with the matching index", () => {
  const items = buildTimelineModel(events, 6, { "3": "A handoff passes work on." }).items;
  assert.equal(items[3].explanation, "A handoff passes work on.");
  assert.equal(items[2].explanation, undefined);
});

test("every event type has a step label in English and Czech", () => {
  const en = locale("en");
  const cs = locale("cs");
  for (const type of EVENT_TYPES) {
    const { key } = describeStep({ index: 0, type, agent: "a", summary: "s" });
    assert.ok(key in en, `en is missing ${key}`);
    assert.ok(key in cs, `cs is missing ${key}`);
  }
  assert.ok("step.unknown" in en && "step.unknown" in cs);
});

test("describeStep passes the agent and summary as parameters", () => {
  const d = describeStep({ index: 5, type: "tool_call", agent: "researcher", summary: "web_search" });
  assert.equal(d.key, "step.tool_call");
  assert.deepEqual(d.params, { agent: "researcher", summary: "web_search" });
  assert.equal(describeStep({ index: 0, type: "nonsense" }).key, "step.unknown");
});

test("stepMessage returns the exact text of the event, never altered", () => {
  const hostile = "<img src=x onerror=alert(1)> **not bold**";
  assert.equal(stepMessage({ type: "agent_output", agent: "a", text: hostile }), hostile);
  assert.equal(stepMessage({ type: "tool_result", agent: "a", output: hostile }), hostile);
  assert.equal(stepMessage({ type: "handoff", from: "a", to: "b", note: "Go on." }), "Go on.");
  assert.equal(stepMessage({ type: "run_start", task: "Do it" }), "Do it");
  assert.equal(stepMessage({ type: "error", message: "Boom" }), "Boom");
  assert.equal(stepMessage({ type: "done" }), "");
});

test("stepMessage shows structured tool input as readable text", () => {
  const text = stepMessage({ type: "tool_call", agent: "a", tool: "web_search", input: { query: "x" } });
  assert.ok(text.includes("web_search"));
  assert.ok(text.includes('"query": "x"'));
  assert.equal(stepMessage({ type: "tool_call", agent: "a", tool: "t", input: "plain" }), "t\nplain");
});
