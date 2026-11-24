import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { addRun, parseArgs, withDefinition } from "../scripts/add-library-run.js";

const sample = JSON.parse(readFileSync(new URL("../public/runs/sequential-simple.json", import.meta.url), "utf8"));
const good = () => ({ ...JSON.parse(JSON.stringify(sample)), id: "exported-123", title: "A recorded run" });
const setup = (runs = []) => {
  const files = {};
  return { files, readIndex: () => ({ runs }), writeFile: (name, text) => { files[name] = text; } };
};
const opts = (over = {}) => ({ id: "debate-simple", level: 1, paths: { patterns: 2 }, tags: ["debate", "basics"], ...over });
const add = (run, options, io) => addRun({ run, options, readIndex: io.readIndex, writeFile: io.writeFile });

test("a good run is written under its slug and listed with the fields of the library", () => {
  const io = setup();
  const result = add(good(), opts({ kind: "pair", twin: "debate-complex", home: true }), io);
  assert.equal(JSON.parse(io.files["debate-simple.json"]).id, "debate-simple");
  const index = JSON.parse(io.files["index.json"]);
  assert.deepEqual(index.runs[0], result.entry);
  assert.deepEqual(result.entry, {
    id: "debate-simple", title: "A recorded run", pattern: "sequential", language: "en", timeScale: 3, home: true,
    provider: sample.recordedWith.provider, outcome: "finished", tags: ["debate", "basics"], level: 1, kind: "pair", twin: "debate-complex", paths: { patterns: 2 },
  });
});

test("the time scale is taken from the options, and teaches texts are kept in both languages", () => {
  const io = setup();
  const { entry } = add(good(), opts({ timeScale: 2, teaches: { en: "One", cs: "Jedna" } }), io);
  assert.equal(entry.timeScale, 2);
  assert.deepEqual(entry.teaches, { en: "One", cs: "Jedna" });
});

test("an entry with the same id is replaced in place and keeps the detail languages it had", () => {
  const io = setup([{ id: "other" }, { id: "debate-simple", detail: ["en", "cs"], title: "old", home: true }]);
  add(good(), opts(), io);
  const index = JSON.parse(io.files["index.json"]);
  assert.equal(index.runs.length, 2);
  assert.equal(index.runs[1].title, "A recorded run");
  assert.deepEqual(index.runs[1].detail, ["en", "cs"]);
  assert.equal(index.runs[1].home, true);
});

test("a run that is not valid, too big, or has a script tag is refused", () => {
  assert.throws(() => add({ nonsense: true }, opts(), setup()), /not a valid run/i);
  const big = good();
  big.events.at(-1).finalText += "x".repeat(210 * 1024);
  assert.throws(() => add(big, opts(), setup()), /200 KB/);
  const script = good();
  script.title = "bad <script>alert(1)</script>";
  assert.throws(() => add(script, opts(), setup()), /script/i);
});

test("an unknown goal, a step that is not a whole number, a level outside 1 to 3 and a bad kind are refused", () => {
  assert.throws(() => add(good(), opts({ paths: { nowhere: 1 } }), setup()), /goal/i);
  assert.throws(() => add(good(), opts({ paths: { patterns: 0 } }), setup()), /step/i);
  assert.throws(() => add(good(), opts({ level: 4 }), setup()), /level/i);
  assert.throws(() => add(good(), opts({ kind: "odd" }), setup()), /kind/i);
  assert.throws(() => add(good(), opts({ id: "Bad Id" }), setup()), /id/i);
});

test("a twin that exists must name this run back; a twin that is not recorded yet is allowed", () => {
  assert.throws(() => add(good(), opts({ twin: "debate-complex" }), setup([{ id: "debate-complex", twin: "someone-else" }])), /twin/i);
  const ok = setup([{ id: "debate-complex", twin: "debate-simple" }]);
  assert.equal(add(good(), opts({ twin: "debate-complex" }), ok).entry.twin, "debate-complex");
  const waiting = add(good(), opts({ twin: "debate-complex" }), setup());
  assert.match(waiting.warnings.join(" "), /debate-complex/);
});

test("the command line is turned into options, with the path repeated for several goals", () => {
  const parsed = parseArgs(["file.json", "--id", "x-simple", "--level", "2", "--kind", "bad", "--twin", "x-fixed", "--path", "patterns:3", "--path", "wrong:1", "--tags", "a,b", "--home", "--time-scale", "2", "--teaches-en", "E", "--teaches-cs", "C"]);
  assert.deepEqual(parsed, { file: "file.json", options: { id: "x-simple", level: 2, kind: "bad", twin: "x-fixed", paths: { patterns: 3, wrong: 1 }, tags: ["a", "b"], home: true, timeScale: 2, teaches: { en: "E", cs: "C" } } });
});

test("a definition file fills what the command line leaves out, and the command line wins", () => {
  const definition = { library: { level: 2, paths: { patterns: 7 }, tags: ["basics"], teaches: { en: "E", cs: "C" } } };
  const merged = withDefinition({ id: "x", level: 3, paths: {} }, definition);
  assert.deepEqual(merged, { level: 3, paths: { patterns: 7 }, tags: ["basics"], teaches: { en: "E", cs: "C" }, id: "x" });
  assert.deepEqual(withDefinition({ id: "x", paths: { save: 1 } }, null), { id: "x", paths: { save: 1 } });
  const io = setup();
  const { entry } = add(good(), withDefinition({ id: "debate-simple" }, definition), io);
  assert.deepEqual([entry.level, entry.paths, entry.teaches.cs], [2, { patterns: 7 }, "C"]);
});

test("the options of the command line include the definition file", () => {
  assert.equal(parseArgs(["f.json", "--definition", "d.json", "--id", "x"]).options.definition, "d.json");
});

test("a run with no path is allowed: it is only in the list of the library, not on the recommended path", () => {
  const { entry } = add(good(), opts({ paths: {} }), setup());
  assert.deepEqual(entry.paths, {});
  assert.equal(entry.level, 1);
});
