import { test } from "node:test";
import assert from "node:assert/strict";
import { mayFormat, validFormat, cleanFormat, formatPromptText, checkFormat, formatRepairText, formatSchema } from "../public/js/engine/format.js";

const F = { fields: [{ name: "title", type: "text" }, { name: "n", type: "number" }, { name: "ok", type: "yesno" }, { name: "tags", type: "list" }] };

test("mayFormat: only agents whose reply is not already a decision", () => {
  assert.equal(mayFormat("writer", "sequential"), true);
  assert.equal(mayFormat("planner", "sequential"), true);
  assert.equal(mayFormat("planner", "planexec"), false);
  assert.equal(mayFormat("supervisor", "supervisor"), false);
  assert.equal(mayFormat("writer", "handoff"), false);
  for (const a of ["evaluator", "router", "tally", "splitter"]) assert.equal(mayFormat(a, "sequential"), false, a);
});

test("validFormat: one to five fields, clean unique names, known types", () => {
  assert.equal(validFormat({ fields: [{ name: "title", type: "text" }] }), true);
  assert.equal(validFormat({ fields: [] }), false);
  assert.equal(validFormat({ fields: Array.from({ length: 6 }, (_, i) => ({ name: `f${i}`, type: "text" })) }), false);
  assert.equal(validFormat({ fields: [{ name: "x".repeat(31), type: "text" }] }), false);
  assert.equal(validFormat({ fields: [{ name: "bad!", type: "text" }] }), false);
  assert.equal(validFormat({ fields: [{ name: "Title", type: "text" }, { name: "title", type: "text" }] }), false);
  assert.equal(validFormat({ fields: [{ name: "title", type: "date" }] }), false);
  assert.equal(validFormat({ fields: [{ name: "première vue_2", type: "text" }] }), true);
  assert.equal(validFormat(null), false);
});

test("cleanFormat trims names and drops what is not valid", () => {
  assert.deepEqual(cleanFormat({ fields: [{ name: " title ", type: "text" }] }), { fields: [{ name: "title", type: "text" }] });
  assert.equal(cleanFormat({ fields: [{ name: "!", type: "text" }] }), null);
  assert.equal(cleanFormat(null), null);
});

test("checkFormat accepts plain, fenced and wrapped replies and drops extra fields", () => {
  const good = '{"title":"A","n":3,"ok":true,"tags":["x","y"]}';
  const r = checkFormat(good, F);
  assert.equal(r.ok, true);
  assert.equal(r.text, good);
  assert.equal(checkFormat("```json\n" + good + "\n```", F).text, good);
  assert.equal(checkFormat("Here is the JSON: " + good + " Done.", F).text, good);
  const extra = checkFormat('{"zzz":1,"tags":["x"],"ok":false,"n":1,"title":"T"}', F);
  assert.equal(extra.text, '{"title":"T","n":1,"ok":false,"tags":["x"]}');
});

test("checkFormat names each problem", () => {
  assert.deepEqual(checkFormat('{"n":1,"ok":true,"tags":[]}', F).problems, ["title is missing"]);
  assert.deepEqual(checkFormat('{"title":"A","n":"42","ok":true,"tags":[]}', F).problems, ["n must be a number"]);
  assert.deepEqual(checkFormat('{"title":"A","n":1,"ok":"yes","tags":[]}', F).problems, ["ok must be true or false"]);
  assert.deepEqual(checkFormat('{"title":"A","n":1,"ok":true,"tags":"x"}', F).problems, ["tags must be a list of texts"]);
  assert.deepEqual(checkFormat('{"title":5,"n":1,"ok":true,"tags":[]}', F).problems, ["title must be text"]);
  assert.deepEqual(checkFormat("Sure!", F).problems, ["the reply is not one JSON object"]);
  assert.deepEqual(checkFormat("[1,2]", F).problems, ["the reply is not one JSON object"]);
});

test("prompt, repair message and schema", () => {
  const f = { fields: [{ name: "title", type: "text" }, { name: "tags", type: "list" }] };
  assert.equal(formatPromptText(f), 'Reply with one JSON object and nothing else (no text before or after it). The fields:\n"title": text\n"tags": a list of texts');
  assert.equal(formatRepairText(["title is missing", "n must be a number"]), "Your reply does not fit the format: title is missing; n must be a number. Reply again with one JSON object and nothing else.");
  assert.deepEqual(formatSchema(F), {
    type: "object",
    properties: { title: { type: "string" }, n: { type: "number" }, ok: { type: "boolean" }, tags: { type: "array", items: { type: "string" } } },
    required: ["title", "n", "ok", "tags"],
    additionalProperties: false,
  });
});
