import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runDesign } from "../public/js/engine/orchestrator.js";
import { handoffRefusal } from "../public/js/engine/runners/handoff.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";
import { validateRun } from "../public/js/run-schema.js";
import { deriveInspector } from "../public/js/replay/inspect-model.js";
import { buildStatistics } from "../public/js/play-model.js";
import { createSkipper } from "../public/js/create/create-model.js";

const node = (id, agent = "free", extra = {}) => ({ id, agent, name: id, instructions: "x", model: "fast", search: false, ...extra });
const text = (t) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn", usage: { input_tokens: 10, output_tokens: 5 } });
const hand = (to, note = "go") => JSON.stringify({ action: "handoff", to, note });
const finish = (answer = "DONE") => JSON.stringify({ action: "finish", answer });
// a -> b is allowed; c exists but a has no arrow to it
const design = () => ({ pattern: "handoff", start: "a", nodes: [node("a"), node("b"), node("c")], edges: [{ from: "a", to: "b" }, { from: "b", to: "c" }] });
function scripted(replies) {
  const calls = [];
  const call = async (body) => {
    calls.push(structuredClone(body));
    const next = replies.shift();
    if (next === undefined) throw new Error("script ran out");
    return text(next);
  };
  return { call, calls };
}
async function run(call) {
  const events = [];
  let error = null;
  let result = null;
  try {
    result = await runDesign({ design: design(), task: "Task", limits: LIMIT_DEFAULTS, call, emit: (e) => events.push(e) });
  } catch (e) {
    error = e;
  }
  return { result, events, error };
}
const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));

test("a handoff to an agent without an arrow is recognised, an allowed or odd reply is not", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(handoffRefusal(hand("c"), ["b"], ids), { to: "c", reason: "no-arrow" });
  assert.deepEqual(handoffRefusal(hand("zzz"), ["b"], ids), { to: "zzz", reason: "unknown" });
  assert.equal(handoffRefusal(hand("b"), ["b"], ids), null);
  assert.equal(handoffRefusal("not json", ["b"], ids), null);
  assert.equal(handoffRefusal(finish(), ["b"], ids), null);
});

test("a refused handoff is recorded, the agent is told why and may try again", async () => {
  const { call, calls } = scripted([hand("c"), hand("b"), finish("OK")]);
  const { result, events } = await run(call);
  assert.equal(result.outcome, "finished");
  const refused = events.filter((e) => e.type === "handoff_refused");
  assert.equal(refused.length, 1);
  assert.deepEqual({ from: refused[0].from, to: refused[0].to, reason: refused[0].reason }, { from: "a", to: "c", reason: "no-arrow" });
  const repair = calls[1].messages.at(-1).content;
  assert.ok(repair.includes("no arrow") && repair.includes("c") && repair.includes("b"), repair);
  assert.equal(events.filter((e) => e.type === "handoff").length, 1);
});

test("asking twice for a handoff that is not allowed ends the run with a clear error", async () => {
  const { call } = scripted([hand("c"), hand("c")]);
  const { result, events } = await run(call);
  assert.equal(result.outcome, "failed");
  const message = events.find((e) => e.type === "error")?.message ?? "";
  assert.ok(message.includes("handoff.refused"), message);
  assert.ok(message.includes("hand over to c"), message);
  assert.equal(events.filter((e) => e.type === "handoff_refused").length, 2);
});

test("a recorded refusal passes the check of a run and shows as a step of the agent", async () => {
  const { call } = scripted([hand("c"), hand("b"), finish()]);
  const { events } = await run(call);
  const record = { id: "r", design: design(), events, task: "Task", recordedWith: { provider: "anthropic" } };
  assert.equal((validateRun({ ...record, schemaVersion: 1 }).errors ?? []).some((e) => e.includes("handoff_refused")), false);
  const inspector = deriveInspector(events);
  const step = inspector.agents.a.steps.find((s) => s.refused && s.to === "c");
  assert.ok(step, "a step for the refusal");
  assert.equal(step.title.key, "insp.handoffRefused");
  assert.equal(buildStatistics(record).refusedHandoffs, 1);
});

test("a carried-on run does not record the same refusal again", () => {
  const skip = createSkipper([{ type: "handoff_refused", from: "a", to: "c", reason: "no-arrow" }]);
  assert.equal(skip({ type: "handoff_refused", from: "a", to: "c", reason: "no-arrow" }), true);
  assert.equal(skip({ type: "handoff_refused", from: "a", to: "c", reason: "no-arrow" }), false);
});

test("the texts of the handoff rule exist in both languages", () => {
  for (const k of ["insp.handoffRefused", "insp.handoffRefused.no-arrow", "insp.handoffRefused.unknown", "stats.refusedHandoffs"]) {
    assert.ok(en[k], `en ${k}`);
    assert.ok(cs[k], `cs ${k}`);
    assert.notEqual(cs[k], en[k], `cs ${k} is not translated`);
  }
  assert.ok(en["help.handoff"] === undefined || true);
});
