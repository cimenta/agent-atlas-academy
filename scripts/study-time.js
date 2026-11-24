// Calculates the study time of every run in the Library with the method of public/js/study-time.js and prints a table.
//   node scripts/study-time.js            prints only
//   node scripts/study-time.js --write    puts studyMinutes and runSeconds into public/runs/index.json
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { studyTime } from "../public/js/study-time.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const en = readJson(join(root, "locales", "en.json"));
const indexPath = join(root, "runs", "index.json");
const index = readJson(indexPath);
const list = Array.isArray(index) ? index : index.runs;

function partsOf(item, lang) {
  const run = readJson(join(root, "runs", `${item.id}.json`));
  const file = (kind) => { const p = join(root, "runs", `${item.id}.${kind}.${lang}.json`); return existsSync(p) ? readJson(p) : null; };
  const detail = file("detail") ?? {};
  const notes = Object.values(file("explanations") ?? {});
  const events = run.events ?? [];
  const seconds = Math.max(0, ...events.map((e) => (Number.isFinite(e.t) ? e.t / 1000 : 0)));
  return {
    patternText: en[`create.pattern.${run.pattern}`] ?? "",
    agents: (run.design?.nodes ?? []).length,
    taskText: run.task ?? events.find((e) => e.type === "run_start")?.task ?? "",
    outputs: events.filter((e) => e.type === "agent_output").map((e) => e.text),
    notes,
    sections: [detail.about, detail.how, detail.learns, detail.watch],
    runSeconds: seconds || (run.durationMs ?? 0) / 1000,
    apiCalls: (run.apiCalls ?? []).length,
  };
}

let sum = 0;
const rows = [];
for (const item of list) {
  const minutes = Math.round((studyTime(partsOf(item, "en")).minutes + studyTime(partsOf(item, "cs")).minutes) / 2);
  item.studyMinutes = minutes;
  item.runSeconds = Math.round(partsOf(item, "en").runSeconds);
  sum += minutes;
  rows.push([item.id, minutes]);
}
for (const [id, m] of rows) console.log(String(m).padStart(3), id);
console.log(`\n${rows.length} runs, ${sum} min = ${(sum / 60).toFixed(1)} h, average ${(sum / rows.length).toFixed(1)} min`);
if (process.argv.includes("--write")) {
  writeFileSync(indexPath, JSON.stringify(Array.isArray(index) ? list : index, null, 2) + "\n");
  console.log("studyMinutes written to runs/index.json");
}
