import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { deriveInspector } from "../public/js/replay/inspect-model.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const en = JSON.parse(read("../public/locales/en.json"));
const cs = JSON.parse(read("../public/locales/cs.json"));

test("the inspector keeps how a run ended, so the player can tell not called from not reached", () => {
  const events = [{ type: "run_start", task: "t", t: 0 }, { type: "agent_start", agent: "boss", t: 1 }, { type: "done", outcome: "stopped_limit", t: 2 }];
  assert.equal(deriveInspector(events).outcome, "stopped_limit");
  assert.equal(deriveInspector(events, 2).outcome, null, "not set before the done event is reached");
  assert.equal(deriveInspector([{ type: "done", outcome: "finished", t: 0 }]).outcome, "finished");
});

test("the player and the recording note have texts in both languages", () => {
  for (const [lang, locale] of [["en", en], ["cs", cs]]) {
    for (const k of ["player.statusIdle", "player.statusUnreached", "insp.idle", "insp.unreached", "play.recordingNote", "play.recordingNoteLink"]) assert.ok(locale[k], `${lang} ${k}`);
  }
});

test("the player source maps the new states and the library note links to the lab", () => {
  const view = read("../public/js/replay/view.js");
  assert.match(view, /idle: "player\.statusIdle"/);
  assert.match(view, /unreached: "player\.statusUnreached"/);
  assert.match(read("../public/js/play-pages.js"), /recording-note/);
});

test("an agent that was working when a limit stopped the run is stopped, with the reason", () => {
  const events = [{ type: "run_start", task: "t", t: 0 }, { type: "agent_start", agent: "a", t: 1 }, { type: "done", outcome: "stopped_limit", reason: "steps", t: 2 }];
  const state = deriveInspector(events);
  assert.equal(state.agents.a.status, "stopped");
  assert.equal(state.agents.a.stopReason, "steps");
  assert.equal(deriveInspector(events, 2).agents.a.status, "working", "still working before the end of the replay");
  const byUser = deriveInspector([{ type: "agent_start", agent: "a", t: 1 }, { type: "done", outcome: "stopped_user", t: 2 }]);
  assert.equal(byUser.agents.a.stopReason, "user");
  const failed = deriveInspector([{ type: "agent_start", agent: "a", t: 1 }, { type: "error", message: "x", t: 2 }, { type: "done", outcome: "failed", t: 3 }]);
  assert.equal(failed.agents.a.status, "error");
  for (const [lang, locale] of [["en", en], ["cs", cs]]) for (const k of ["player.statusStopped", "player.stopReason.limit", "player.stopReason.steps", "player.stopReason.tokens", "player.stopReason.user", "player.stopReason.agent_steps"]) assert.ok(locale[k], `${lang} ${k}`);
});
