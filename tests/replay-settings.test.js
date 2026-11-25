import { test } from "node:test";
import assert from "node:assert/strict";
import { settingsRows } from "../public/js/replay/settings-view.js";

const t = (key) => key;
const rowOf = (rows, key) => rows.find((r) => r.key === key);

test("the settings rows show role, provider, model, search and instructions of an agent", () => {
  const node = { id: "a", agent: "writer", model: "fast", slot: "groq-free", search: false };
  const rows = settingsRows({ node, design: { nodes: [node] }, agent: { label: "Writer", model: "openai/gpt-oss-20b" }, t });
  assert.match(rowOf(rows, "insp.set.provider").text, /Groq/);
  assert.match(rowOf(rows, "insp.set.provider").text, /insp\.set\.free/);
  assert.match(rowOf(rows, "insp.set.model").text, /openai\/gpt-oss-20b/);
  assert.equal(rowOf(rows, "insp.set.search").text, "insp.set.off");
  assert.equal(rowOf(rows, "insp.set.instructions").text, "insp.set.defaultInstructions");
  assert.equal(rowOf(rows, "insp.set.limits").text, "insp.set.runLimits");
  assert.equal(rowOf(rows, "insp.set.onLimit"), undefined);
});

test("own instructions, own limits and what happens at them are shown, and optional parts only when set", () => {
  const node = { id: "a", agent: "free", model: "fast", slot: "groq-free", search: true, instructions: "Answer as a cook.", limits: { maxOutputTokens: 1000 }, onLimit: "pass", approve: true };
  const rows = settingsRows({ node, design: { nodes: [node] }, agent: { label: "Cook", model: "m" }, t });
  assert.equal(rowOf(rows, "insp.set.instructions").pre, "Answer as a cook.");
  assert.match(rowOf(rows, "insp.set.limits").text, /1000/);
  assert.equal(rowOf(rows, "insp.set.onLimit").text, "insp.set.onLimitPass");
  assert.ok(rowOf(rows, "insp.set.approve"));
  assert.equal(rowOf(rows, "insp.set.condense"), undefined);
});

test("an agent that is not in the recorded design still gets a row", () => {
  const rows = settingsRows({ node: null, design: null, agent: { label: "Ghost" }, t });
  assert.equal(rows.length, 1);
});

test("the skills of an agent are shown by kind and name, with the culture, and their text; an agent without skills has no such rows", () => {
  const skills = [{ id: "critic", kind: "role", name: "Critic", text: "You are a critic." }, { id: "business", kind: "styl", name: "Business writing", param: "th", text: "Style: business." }];
  const node = { id: "a", agent: "writer", model: "fast", slot: "groq-free", search: false, skills };
  const rows = settingsRows({ node, design: { nodes: [node] }, agent: { label: "Writer", model: "m" }, t });
  assert.equal(rowOf(rows, "insp.set.skills").text, "skills.kind.role: Critic · skills.kind.styl: Business writing (skills.culture.th)");
  assert.match(rowOf(rows, "insp.set.skillsText").pre, /You are a critic\.\n\nStyle: business\./);
  const plain = settingsRows({ node: { ...node, skills: undefined }, design: { nodes: [node] }, agent: { label: "Writer", model: "m" }, t });
  assert.equal(rowOf(plain, "insp.set.skills"), undefined);
});
