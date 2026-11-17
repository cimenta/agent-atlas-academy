import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { pendingApprovals, approvedAgents } from "../public/js/engine/approval.js";
import { createEditor } from "../public/js/create/editor-model.js";
import { deriveInspector } from "../public/js/replay/inspect-model.js";
import { describeOutcome, runOutcomeMessageKey } from "../public/js/create/create-model.js";
import { buildRunRecord } from "../public/js/engine/run-record.js";
import { validateRun } from "../public/js/run-schema.js";
import { findSection } from "../public/js/help-topics.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));

const design = {
  pattern: "sequential",
  nodes: [
    { id: "writer", agent: "researcher", model: "fast", search: false },
    { id: "critic", agent: "critic", model: "fast", search: false, approve: true },
  ],
  edges: [{ from: "writer", to: "critic" }],
};
const reply = (text) => ({ content: [{ type: "text", text }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 10 } });

async function run(extra = {}) {
  const events = [];
  const calls = [];
  const result = await runDesign({ design, task: "t", limits: {}, call: async (body) => { calls.push(body); return reply(`answer ${calls.length}`); }, emit: (e) => events.push(e), ...extra });
  return { result, events, calls };
}

test("an agent marked for approval stops the run before it runs, and says what it would receive", async () => {
  const { result, events, calls } = await run();
  assert.equal(result.outcome, "waiting_approval");
  assert.equal(calls.length, 1);
  assert.ok(!events.some((e) => e.type === "agent_start" && e.agent === "critic"));
  const waiting = events.find((e) => e.type === "approval");
  assert.equal(waiting.agent, "critic");
  assert.match(waiting.input, /answer 1/);
  assert.equal(events.at(-1).type, "done");
  assert.equal(events.at(-1).outcome, "waiting_approval");
  assert.ok(!events.some((e) => e.type === "error"));
});

test("after approval the run carries on from the saved answers and does not ask again", async () => {
  const first = await run();
  const answers = first.events.filter((e) => e.type === "agent_output").map((e) => ({ agent: e.agent, text: e.text, tokens: e.tokens }));
  const second = await run({ resume: answers, approved: ["critic"] });
  assert.equal(second.result.outcome, "finished");
  assert.equal(second.calls.length, 1, "only the agent that waited calls the provider");
  assert.ok(!second.events.some((e) => e.type === "approval"));
});

test("a design without the switch is not slowed down", async () => {
  const plain = { ...design, nodes: design.nodes.map(({ approve, ...n }) => n) };
  const events = [];
  const result = await runDesign({ design: plain, task: "t", limits: {}, call: async () => reply("x"), emit: (e) => events.push(e) });
  assert.equal(result.outcome, "finished");
});

test("approve must be true when it is there, and the editor keeps it only when on", () => {
  assert.equal(validateDesign(design).ok, true);
  const bad = { ...design, nodes: [design.nodes[0], { ...design.nodes[1], approve: "yes" }] };
  assert.ok(validateDesign(bad).errors.some((e) => e.code === "node.approve"));
  const editor = createEditor("sequential");
  const added = editor.addNode("critic", { approve: true });
  assert.equal(editor.design().nodes[0].approve, true);
  editor.setNode(added.id, { approve: false });
  assert.equal("approve" in editor.design().nodes[0], false);
});

test("pending approvals are the approval events without an approved event after them", () => {
  const events = [{ type: "approval", agent: "a" }, { type: "approval", agent: "b" }, { type: "approved", agent: "a" }];
  assert.deepEqual(pendingApprovals(events).map((e) => e.agent), ["b"]);
  assert.deepEqual(approvedAgents(events), ["a"]);
});

test("the replay shows an Approved by you step, and the outcome counts as a warning", () => {
  const events = [
    { type: "run_start", task: "t", design, t: 0 },
    { type: "approved", agent: "critic", t: 5 },
    { type: "agent_start", agent: "critic", t: 6 },
  ];
  const state = deriveInspector(events);
  assert.ok(state.agents.critic.steps.some((s) => s.kind === "approval"));
  assert.equal(describeOutcome({ outcome: "waiting_approval", events: [] }).level, "warn");
  assert.equal(runOutcomeMessageKey("waiting_approval"), "run.outcome.waiting_approval");
});

test("the approval texts and Help sections exist in both languages", () => {
  for (const [lang, locale] of [["en", en], ["cs", cs]]) {
    for (const id of ["create-approval", "play-approval"]) {
      const found = findSection(locale["help.body"], id);
      assert.ok(found, `${lang} ${id}`);
      for (const rid of found.section.related) assert.ok(findSection(locale["help.body"], rid), `${lang} ${id} -> ${rid}`);
    }
    for (const k of ["editor.approvalHeading", "editor.approve", "editor.approveNote", "approval.heading", "approval.paused", "approval.next", "approval.cut", "approval.approve", "approval.stop", "approval.stopNote", "insp.approved", "insp.approvedOut", "insp.doc.approval", "result.status.waiting_approval", "run.outcome.waiting_approval", "design.error.node.approve"]) assert.ok(locale[k], `${lang} ${k}`);
  }
});

test("a paused run, and the same run after approval, are valid records that can be saved", async () => {
  const first = await run();
  const paused = buildRunRecord({ id: "p1", design, task: "t", events: first.events, limits: {}, language: "en", appVersion: "test" });
  assert.equal(paused.outcome, "waiting_approval");
  assert.deepEqual(validateRun(paused), { ok: true, errors: [] });
  // Stopped there: the agent that waited never started, and the record is still valid.
  const stopped = { ...paused, outcome: "stopped_user", events: first.events.map((e) => (e.type === "done" ? { ...e, outcome: "stopped_user" } : e)) };
  assert.deepEqual(validateRun(stopped), { ok: true, errors: [] });
});
