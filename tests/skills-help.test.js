import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { splitTopics } from "../public/js/help-topics.js";
import { loadDefinition } from "../public/js/create/definition.js";
import { validSkills } from "../public/js/engine/skills.js";
import { APP_SKILLS } from "../public/js/skill-library.js";

const read = (p) => readFileSync(new URL(p, import.meta.url), "utf8");
const locale = (l) => JSON.parse(read(`../public/locales/${l}.json`));

for (const lang of ["en", "cs"]) {
  test(`${lang}: the Help explains the skills of Settings and of an agent, and each points to the other`, () => {
    const sections = splitTopics(locale(lang)["help.body"]).flatMap((t) => t.sections);
    const byId = new Map(sections.map((s) => [s.id, s]));
    for (const id of ["settings-skills", "create-skills"]) assert.ok(byId.get(id)?.text.length > 300, id);
    assert.ok(byId.get("settings-skills").related.includes("create-skills"));
    assert.ok(byId.get("create-skills").related.includes("settings-skills"));
    for (const s of sections) for (const r of s.related) assert.ok(byId.has(r), `${s.id} points to ${r}`);
  });

  test(`${lang}: the article on skills is there, is linked from its neighbours and names the three kinds`, () => {
    const text = read(`../public/content/articles/${lang}/skills.md`);
    assert.match(text, /^---\ntitle: /);
    for (const word of lang === "en" ? ["Role", "Procedure", "Style"] : ["Role", "Postup", "Styl"]) assert.ok(text.includes(`**${word}**`), word);
    const index = JSON.parse(read(`../public/content/articles/${lang}/index.json`));
    assert.ok(index.some((a) => a.slug === "skills"));
    for (const slug of index.find((a) => a.slug === "skills").related) assert.ok(index.some((a) => a.slug === slug), slug);
  });
}

test("the definition with two skills loads, has a procedure and a style from the app, and keeps their texts", () => {
  const loaded = loadDefinition(read("../demo-definitions/skills-procedure-and-style.json"));
  assert.equal(loaded.ok, true, JSON.stringify(loaded));
  const nodes = loaded.editor.design().nodes;
  const skills = nodes.flatMap((n) => n.skills ?? []);
  assert.deepEqual(skills.map((s) => s.kind).sort(), ["postup", "styl"]);
  for (const n of nodes) assert.equal(validSkills(n.skills), true, n.id);
  const app = new Map(APP_SKILLS.map((s) => [s.id, s]));
  for (const s of skills) assert.ok(s.text.includes(app.get(s.id).versions[1]), `${s.id} carries the text of the app skill`);
  assert.equal(skills.find((s) => s.id === "business").param, "cs");
  assert.ok(loaded.about?.en?.title && loaded.about?.cs?.title);
});

test("every definition of the demo folder that carries skills keeps them valid", () => {
  for (const f of readdirSync(new URL("../demo-definitions/", import.meta.url)).filter((x) => x.endsWith(".json"))) {
    const loaded = loadDefinition(read(`../demo-definitions/${f}`));
    assert.equal(loaded.ok, true, f);
  }
});
