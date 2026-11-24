// Adds one exported run to the Library: checks it, writes public/runs/<id>.json and puts its entry into public/runs/index.json.
//   node scripts/add-library-run.js <exported-run.json> --id <slug> --level <1-3> --path <goal>:<step> [--path <goal>:<step> ...]
//        [--kind pair|bad] [--twin <id>] [--tags a,b] [--home] [--time-scale <n>] [--teaches-en <text>] [--teaches-cs <text>]
//        [--definition <definition.json>]  (its library section gives level, kind, twin, path, tags and teaches; the options above win)
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateRun } from "../public/js/run-schema.js";
import { GOALS } from "../public/js/library-path.js";
import { cleanLibraryMeta } from "../public/js/create/definition.js";

const MAX_BYTES = 200 * 1024;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DEFAULT_TIME_SCALE = 3;

// The command line as { file, options }; --path may be repeated, one goal each.
export function parseArgs(argv) {
  const options = { paths: {} };
  let file = "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      file = arg;
      continue;
    }
    const name = arg.slice(2);
    if (name === "home") {
      options.home = true;
      continue;
    }
    const value = argv[(i += 1)];
    if (name === "id") options.id = value;
    else if (name === "definition") options.definition = value;
    else if (name === "level") options.level = Number(value);
    else if (name === "kind") options.kind = value;
    else if (name === "twin") options.twin = value;
    else if (name === "tags") options.tags = value.split(",").map((x) => x.trim()).filter(Boolean);
    else if (name === "time-scale") options.timeScale = Number(value);
    else if (name === "teaches-en") options.teaches = { ...options.teaches, en: value };
    else if (name === "teaches-cs") options.teaches = { ...options.teaches, cs: value };
    else if (name === "path") {
      const [goal, step] = String(value).split(":");
      options.paths[goal] = Number(step);
    } else throw new Error(`Unknown option --${name}`);
  }
  return { file, options };
}

// The options a definition file already carries (its library section) fill what the command line leaves out; the command line wins.
export function withDefinition(options, definition) {
  const meta = cleanLibraryMeta(definition?.library) ?? {};
  const own = Object.fromEntries(Object.entries(options).filter(([key, value]) => value !== undefined && !(key === "paths" && Object.keys(value).length === 0)));
  const { definition: _file, ...rest } = own;
  const teaches = { ...meta.teaches, ...(rest.teaches ?? {}) };
  return { ...meta, ...rest, paths: { ...meta.paths, ...(rest.paths ?? {}) }, ...(Object.keys(teaches).length > 0 ? { teaches } : {}) };
}

// readIndex() gives the parsed index.json; writeFile(name, text) writes a file under public/runs. Returns { entry, warnings }; throws a plain Error to refuse.
export function addRun({ run, options, readIndex, writeFile }) {
  const { id, level, kind, twin, paths, tags, home, timeScale, teaches } = options;
  if (typeof id !== "string" || !SLUG.test(id)) throw new Error("The id must be a slug: lower case letters, digits and single dashes");
  if (!Number.isInteger(level) || level < 1 || level > 3) throw new Error("The level must be 1, 2 or 3");
  if (kind !== undefined && kind !== "pair" && kind !== "bad") throw new Error('The kind must be "pair" or "bad"');
  const goals = Object.entries(paths ?? {});
  if (goals.length === 0) throw new Error("A run needs at least one --path <goal>:<step>");
  for (const [goal, step] of goals) {
    if (!GOALS.includes(goal)) throw new Error(`Unknown goal "${goal}"; the goals are ${GOALS.join(", ")}`);
    if (!Number.isInteger(step) || step < 1) throw new Error(`The step of the goal ${goal} must be a whole number from 1`);
  }
  if (twin !== undefined && !SLUG.test(twin)) throw new Error("The twin must be the id of another run");
  const check = validateRun({ ...run, id });
  if (!check.ok) throw new Error(`This is not a valid run: ${check.errors.join("; ")}`);
  const text = JSON.stringify({ ...run, id }, null, 2);
  if (/<script/i.test(text)) throw new Error("The run contains a script tag");
  if (Buffer.byteLength(text, "utf8") > MAX_BYTES) throw new Error("The run is over 200 KB");

  const index = readIndex();
  const runs = Array.isArray(index?.runs) ? index.runs : [];
  const warnings = [];
  if (twin !== undefined) {
    const other = runs.find((r) => r.id === twin);
    if (other && other.twin !== id) throw new Error(`The twin ${twin} does not name ${id} back; fix its twin first`);
    if (!other) warnings.push(`The twin ${twin} is not in the library yet; add it with --twin ${id}`);
  }
  const at = runs.findIndex((r) => r.id === id);
  const old = at >= 0 ? runs[at] : null;
  const entry = {
    id,
    title: run.title,
    pattern: run.pattern,
    language: run.language,
    timeScale: Number.isFinite(timeScale) && timeScale > 0 ? timeScale : DEFAULT_TIME_SCALE,
    ...(home ?? old?.home ? { home: true } : {}),
    provider: run.recordedWith.provider,
    outcome: run.outcome ?? run.events?.findLast?.((e) => e.type === "done")?.outcome ?? "finished",
    ...(Array.isArray(old?.detail) ? { detail: old.detail } : {}),
    tags: Array.isArray(tags) ? tags : old?.tags ?? [],
    level,
    ...(kind ? { kind } : {}),
    ...(twin ? { twin } : {}),
    paths: { ...paths },
    ...(teaches ?? old?.teaches ? { teaches: teaches ?? old.teaches } : {}),
  };
  const next = at >= 0 ? runs.map((r, i) => (i === at ? entry : r)) : [...runs, entry];
  writeFile(`${id}.json`, `${text}\n`);
  writeFile("index.json", `${JSON.stringify({ ...index, runs: next }, null, 2)}\n`);
  return { entry, warnings };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  try {
    const { file, options } = parseArgs(process.argv.slice(2));
    if (!file) throw new Error("Give the exported run file first");
    const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "runs");
    const definition = options.definition ? JSON.parse(readFileSync(options.definition, "utf8")) : null;
    const result = addRun({
      run: JSON.parse(readFileSync(file, "utf8")),
      options: withDefinition(options, definition),
      readIndex: () => JSON.parse(readFileSync(join(dir, "index.json"), "utf8")),
      writeFile: (name, text) => writeFileSync(join(dir, name), text),
    });
    for (const warning of result.warnings) console.warn(`Warning: ${warning}`);
    console.log(`Added ${result.entry.id} (level ${result.entry.level}). Next: write ${result.entry.id}.detail.en.json, .cs.json and the explanations files, then npm test.`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
