import test from "node:test";
import assert from "node:assert/strict";
import { createEditor } from "../public/js/create/editor-model.js";
import { fillSimpleTeam, teamSignature, SIMPLE_TEAM_SIZE } from "../public/js/create/simple-team.js";
import { SIMPLE_PATTERNS, routeKind, stepStatus, navState, simpleMissingSetup, simpleMissingAll, emptyDecisions } from "../public/js/create/steps-model.js";
import { readFileSync } from "node:fs";

const t = (key) => key;
const built = (pattern) => {
  const editor = createEditor(pattern);
  editor.reset(pattern, { criteria: "example" });
  fillSimpleTeam(editor, pattern, t);
  return editor;
};

test("every pattern of the Simple view starts with a team that has no problems", () => {
  for (const pattern of SIMPLE_PATTERNS) {
    const editor = built(pattern);
    assert.deepEqual(editor.errors(), [], pattern);
    assert.ok(editor.design().nodes.length >= 2, pattern);
  }
});

test("sequential is a chain, parallel runs into the combiner, router fans out from the router", () => {
  const seq = built("sequential").design();
  assert.equal(seq.nodes.length, SIMPLE_TEAM_SIZE.sequential);
  assert.equal(seq.edges.length, 2);
  const par = built("parallel").design();
  const combiner = par.nodes.find((n) => n.agent === "combiner").id;
  assert.deepEqual(par.edges.map((e) => e.to), [combiner, combiner, combiner]);
  const route = built("router").design();
  const router = route.nodes.find((n) => n.agent === "router").id;
  assert.deepEqual(route.edges.map((e) => e.from), [router, router]);
});

test("the evaluator loop keeps the two agents the editor places and gets no extra ones", () => {
  const design = built("evaluator").design();
  assert.deepEqual(design.nodes.map((n) => n.agent), ["writer", "evaluator"]);
});

test("a team the student changed has another signature than the one that was filled", () => {
  const editor = built("sequential");
  const before = teamSignature(editor.design());
  editor.setNode(editor.design().nodes[0].id, { name: "Someone else" });
  assert.notEqual(teamSignature(editor.design()), before);
});

test("the route is fixed for sequential and parallel and chosen by the model for router and evaluator", () => {
  assert.equal(routeKind("sequential"), "fixed");
  assert.equal(routeKind("parallel"), "fixed");
  assert.equal(routeKind("router"), "dynamic");
  assert.equal(routeKind("evaluator"), "dynamic");
});

test("in the Simple view every step can be opened, and what is missing is only said", () => {
  const args = { task: "", decisions: emptyDecisions(), nodeCount: 0, editorOk: false, keysReady: false };
  const hard = stepStatus(args);
  assert.deepEqual(hard.locked, { diagram: true, check: true });
  const soft = stepStatus({ ...args, soft: true });
  assert.deepEqual(soft.locked, { diagram: false, check: false });
  assert.equal(navState({ step: "setup", status: soft }).next, true);
  assert.deepEqual(simpleMissingSetup(soft), ["task", "pattern", "provider"]);
  assert.deepEqual(simpleMissingAll(soft), ["task", "pattern", "provider", "team", "key"]);
});

test("the Simple view has a name and a role for every agent it fills, in both languages", () => {
  for (const file of ["en", "cs"]) {
    const dict = JSON.parse(readFileSync(new URL(`../public/locales/${file}.json`, import.meta.url), "utf8"));
    for (const [pattern, size] of Object.entries(SIMPLE_TEAM_SIZE)) {
      for (let n = 1; n <= size; n++) {
        assert.ok(dict[`create.simple.team.${pattern}.${n}.name`], `${file} ${pattern} ${n} name`);
        assert.ok(dict[`create.simple.team.${pattern}.${n}.role`], `${file} ${pattern} ${n} role`);
      }
    }
  }
});
