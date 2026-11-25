import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { loadDefinition } from "../public/js/create/definition.js";
import { validateDesign } from "../public/js/engine/patterns.js";
import { TAG_GROUPS } from "../public/js/library-tags.js";
import { validateRun } from "../public/js/run-schema.js";
import { isSlot, slotProvider, slotIsFree } from "../public/js/key-slots.js";

// Wave 1 of the Library revamp: ten patterns, a simple and a complex run of each, on the path "patterns" (the goal Patterns of teamwork).
// The level table (the owner confirms it before anything is recorded), id: level / step on the path:
//   level 1 (6): sequential-simple 1, parallel-simple 2, supervisor-simple 3, debate-simple 4, router-simple 5, evaluator-simple 6
//   level 2 (8): sequential-complex 7, parallel-complex 8, evaluator-complex 9, router-complex 10, handoff-simple 11, voting-simple 12, mapreduce-simple 13, planexec-simple 14
//   level 3 (6): supervisor-complex 15, debate-complex 16, handoff-complex 17, voting-complex 18, mapreduce-complex 19, planexec-complex 20
export const WAVE1 = {
  "sequential-simple": [1, 1], "parallel-simple": [1, 2], "supervisor-simple": [1, 3], "debate-simple": [1, 4], "router-simple": [1, 5], "evaluator-simple": [1, 6],
  "sequential-complex": [2, 7], "parallel-complex": [2, 8], "evaluator-complex": [2, 9], "router-complex": [2, 10], "handoff-simple": [2, 11], "voting-simple": [2, 12], "mapreduce-simple": [2, 13], "planexec-simple": [2, 14],
  "supervisor-complex": [3, 15], "debate-complex": [3, 16], "handoff-complex": [3, 17], "voting-complex": [3, 18], "mapreduce-complex": [3, 19], "planexec-complex": [3, 20],
};
// The provider of every pattern (the owner approved the even spread of the five providers; Anthropic is one of them, not the default).
// Free tiers carry the runs that cost nothing to record; Anthropic keeps the two patterns whose decisions are the most demanding.
export const SLOT_OF = {
  sequential: "cloudflare-free", parallel: "openrouter-free", supervisor: "anthropic", debate: "google-free", router: "groq-free",
  evaluator: "google-free", handoff: "anthropic", voting: "openrouter-free", mapreduce: "cloudflare-free", planexec: "groq-free",
};
const PATTERN_OF = (id) => id.replace(/-(simple|complex)$/, "");
const dir = new URL("../demo-definitions/", import.meta.url);
const read = (id) => readFileSync(new URL(`library-${id}.json`, dir), "utf8");
const articles = new Set(JSON.parse(readFileSync(new URL("../public/content/articles/en/index.json", import.meta.url), "utf8")).map((a) => a.slug));

test("there is one definition for every run of the level table, and no other library definition", () => {
  const files = readdirSync(dir).filter((f) => f.startsWith("library-")).map((f) => f.replace(/^library-/, "").replace(/\.json$/, "")).sort();
  assert.deepEqual(files, [...Object.keys(WAVE1), "tools-together"].sort(), "the 20 runs of wave 1 and the run that uses many tools");
});

test("the run with many tools gives every tool of the app to its two agents, has no step on a path, and carries the price list", async () => {
  const { OWN_TOOL_KEYS } = await import("../public/js/engine/own-tools.js");
  const loaded = loadDefinition(read("tools-together"));
  assert.equal(loaded.ok, true, JSON.stringify(loaded));
  const design = loaded.editor.design();
  assert.deepEqual(design.nodes.flatMap((n) => n.tools ?? []).sort(), [...OWN_TOOL_KEYS].sort());
  assert.equal(validateDesign(design).ok, true);
  assert.equal(loaded.editor.notebookOn(), true, "the notes tool needs the notebook");
  assert.equal(loaded.editor.documents().length, 1);
  assert.equal(loaded.library.level, 3);
  assert.equal(loaded.library.paths, undefined, "in the list and in the tags, not on a guided path");
  assert.ok(loaded.library.tags.includes("tool-use"));
  const tags = new Set(Object.values(TAG_GROUPS).flat());
  assert.ok(loaded.library.tags.every((t) => tags.has(t)));
  const data = JSON.parse(read("tools-together"));
  assert.ok(data.design.nodes.every((n) => n.search === false && slotProvider(n.slot) === "anthropic"));
  for (const lang of ["en", "cs"]) {
    const links = [...data.about[lang].description.matchAll(/\(#\/learn\/([a-z0-9-]+)\)/g)].map((m) => m[1]);
    assert.deepEqual(links, ["tools"], lang);
    assert.ok(articles.has("tools"));
  }
  assert.notEqual(data.about.en.title, data.about.cs.title);
  assert.equal(/\d{4}|today|news|latest/i.test(data.task), false, "no live data written into the task");
  assert.ok(data.task.length <= 1000);
});

test("the levels are 6, 8 and 6 runs, and the steps are 1 to 20 once each", () => {
  const levels = [1, 2, 3].map((l) => Object.values(WAVE1).filter(([level]) => level === l).length);
  assert.deepEqual(levels, [6, 8, 6]);
  assert.deepEqual(Object.values(WAVE1).map(([, step]) => step).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
});

for (const id of Object.keys(WAVE1)) {
  test(`${id}: loads, has a valid design of its own pattern, and one task of at most 1000 characters`, () => {
    const loaded = loadDefinition(read(id));
    assert.equal(loaded.ok, true, JSON.stringify(loaded));
    assert.equal(loaded.pattern, PATTERN_OF(id));
    const data = JSON.parse(read(id));
    assert.equal(validateDesign(data.design).ok, true, JSON.stringify(validateDesign(data.design).errors));
    assert.ok(data.task.length > 10 && data.task.length <= 1000);
    assert.equal(/\d{4}|today|news|latest/i.test(data.task), false, "no live data in the task");
  });

  test(`${id}: every agent runs on the key slot of its pattern, with a known model size and no web search`, () => {
    const { design } = JSON.parse(read(id));
    const slot = SLOT_OF[PATTERN_OF(id)];
    assert.ok(isSlot(slot), slot);
    for (const n of design.nodes) {
      assert.equal(n.slot, slot, `${n.id} slot`);
      assert.ok(["fast", "balanced", "strong"].includes(n.model), n.id);
      assert.equal(n.search, false, `${n.id} searches`);
      if (slotProvider(slot) === "cloudflare") assert.notEqual(n.model, "strong", `${n.id}: Cloudflare cuts a call at about 120 s`);
    }
  });

  test(`${id}: has an About in English and Czech that differ, with one link to a Learn article that exists`, () => {
    const { about } = JSON.parse(read(id));
    assert.ok(about.en.title && about.cs.title && about.en.description && about.cs.description);
    assert.notEqual(about.en.title, about.cs.title);
    assert.notEqual(about.en.description, about.cs.description);
    for (const lang of ["en", "cs"]) assert.equal(validateRun({ about: about[lang] }).errors.some((e) => e.startsWith("about")), false, lang);
    for (const lang of ["en", "cs"]) {
      const links = [...about[lang].description.matchAll(/\(#\/learn\/([a-z0-9-]+)\)/g)].map((m) => m[1]);
      assert.equal(links.length, 1, `${lang} links`);
      assert.ok(articles.has(links[0]), `${links[0]} is a Learn article`);
    }
    assert.doesNotMatch(JSON.stringify(about), /learner/i);
  });
}

test("every definition carries its place in the library: the level and the step of the table, tags that exist, and a line of what it teaches in both languages", () => {
  const tags = new Set(Object.values(TAG_GROUPS).flat());
  for (const [id, [level, step]] of Object.entries(WAVE1)) {
    const { library } = loadDefinition(read(id));
    assert.equal(library.level, level, id);
    assert.deepEqual(library.paths, { patterns: step }, id);
    assert.ok(library.tags.length >= 3 && library.tags.every((tag) => tags.has(tag)), id);
    assert.ok(library.teaches.en && library.teaches.cs && library.teaches.en !== library.teaches.cs, id);
  }
});

test("a simple run has fewer agents than the complex run of the same pattern, except where the pattern fixes the shape", () => {
  const count = (id) => JSON.parse(read(id)).design.nodes.length;
  for (const p of ["sequential", "parallel", "supervisor", "debate", "router", "handoff", "voting"]) assert.ok(count(`${p}-simple`) < count(`${p}-complex`), p);
});

// Step 6 of the tools design: seven runs of the library are recorded again with a tool each, so that every tool of the app is shown in a run.
// The tool of the app that each run uses (web search is shown by save-search-on, which already exists).
export const TOOL_RUNS = { "router-simple": "calculator", "planexec-complex": "datetime", "router-complex": "wikipedia", "planexec-simple": "weather", "evaluator-simple": "text_stats", "handoff-simple": "document_search", "supervisor-complex": "notes" };

test("every tool of the app is shown by a run of the library, and the run gives that tool to an agent and carries the tag", async () => {
  const { OWN_TOOL_KEYS } = await import("../public/js/engine/own-tools.js");
  assert.deepEqual(Object.values(TOOL_RUNS).sort(), [...OWN_TOOL_KEYS].sort());
  for (const [id, tool] of Object.entries(TOOL_RUNS)) {
    const loaded = loadDefinition(read(id));
    assert.equal(loaded.ok, true, id);
    const design = loaded.editor.design();
    assert.ok(design.nodes.some((n) => (n.tools ?? []).includes(tool)), `${id} gives ${tool} to an agent`);
    assert.ok(loaded.library.tags.includes("tool-use"), id);
    assert.equal(validateDesign(design).ok, true, id);
  }
});

const TOOL_TAG = { calculator: "tool-calculator", datetime: "tool-datetime", wikipedia: "tool-wikipedia", weather: "tool-weather", text_stats: "tool-text-counting", document_search: "tool-documents", notes: "tool-notes" };

test("every tool has its own tag, and a run carries the tag of each tool it gives to an agent, and no other tool tag", async () => {
  const { OWN_TOOL_KEYS } = await import("../public/js/engine/own-tools.js");
  assert.deepEqual(Object.keys(TOOL_TAG).sort(), [...OWN_TOOL_KEYS].sort());
  const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
  const cs = JSON.parse(readFileSync(new URL("../public/locales/cs.json", import.meta.url), "utf8"));
  for (const tag of Object.values(TOOL_TAG)) {
    assert.ok(en[`tag.${tag}`] && cs[`tag.${tag}`] && en[`tag.desc.${tag}`] && cs[`tag.desc.${tag}`], tag);
    assert.notEqual(en[`tag.${tag}`], cs[`tag.${tag}`], `${tag} is translated`);
  }
  for (const id of [...Object.keys(TOOL_RUNS), "tools-together"]) {
    const { library, editor } = loadDefinition(read(id));
    const used = new Set(editor.design().nodes.flatMap((n) => n.tools ?? []));
    const carried = Object.entries(TOOL_TAG).filter(([, tag]) => library.tags.includes(tag)).map(([tool]) => tool);
    assert.deepEqual(carried.sort(), [...used].sort(), id);
  }
});

test("a run with the notes tool has the notebook on, and a run with the documents tool carries its documents", () => {
  const notes = loadDefinition(read("supervisor-complex"));
  assert.equal(notes.editor.notebookOn(), true);
  const docs = loadDefinition(read("handoff-simple"));
  assert.equal(docs.editor.documents().length, 1);
  assert.ok(docs.editor.documents()[0].text.length > 300 && docs.editor.documents()[0].text.length < 5000);
});

test("a tool run is on a provider that takes tools, and a run with the counting tool asks for the count in its criteria", () => {
  for (const id of Object.keys(TOOL_RUNS)) assert.ok(["groq", "anthropic", "google"].includes(slotProvider(JSON.parse(read(id)).design.nodes[0].slot)), `${id}: Cloudflare and OpenRouter free models are not trusted with tools`);
  assert.match(JSON.parse(read("evaluator-simple")).design.criteria, /Count the words/);
});

test("the five providers are used evenly by wave 1: two patterns each, with Anthropic one of them", () => {
  const per = {};
  for (const slot of Object.values(SLOT_OF)) per[slotProvider(slot)] = (per[slotProvider(slot)] ?? 0) + 1;
  assert.deepEqual(per, { cloudflare: 2, openrouter: 2, anthropic: 2, google: 2, groq: 2 });
  assert.equal(Object.values(SLOT_OF).filter((s) => !slotIsFree(s)).length, 2, "only the Anthropic patterns are paid");
});
