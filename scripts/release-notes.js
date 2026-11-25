// Offers the notes of a release as a list to choose from: the commits since the last release tag, the newest first.
//   node scripts/release-notes.js <notes-file>
// Prints up to 20 lines, asks which to include (numbers like 1 3 5, a range like 1-4, or a for all) and writes the chosen ones as a bullet
// list to <notes-file>. An empty answer writes nothing, and release.bat then uses the line of release-message.txt as before.
// Run by release.bat; the choosing is in pure functions so that a test can check it.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";

export const LIST_MAX = 20;

// The subjects of a git log (one per line: "<sha> <subject>"), without the version prefix that test.bat adds ("v1.19.1-dev.0: "),
// the newest first. The same subject twice (several test commits with one message) is listed once. Version-only commits are left out.
export function parseLog(text, max = LIST_MAX) {
  const seen = new Set();
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = /^([0-9a-f]{7,40})\s+(.*)$/.exec(line.trim());
    if (!m) continue;
    const subject = m[2].replace(/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?:\s*/, "").trim();
    if (subject === "" || /^v\d+\.\d+\.\d+/.test(subject) || seen.has(subject)) continue;
    seen.add(subject);
    out.push({ sha: m[1], subject });
    if (out.length >= max) break;
  }
  return out;
}

// "1 3 5", "1,3", "2-4", "a" (all): the chosen numbers (1-based, inside the list, once each, in the order of the list).
export function parseSelection(answer, count) {
  const text = String(answer ?? "").trim().toLowerCase();
  if (text === "") return [];
  if (text === "a" || text === "all") return Array.from({ length: count }, (_, i) => i + 1);
  const chosen = new Set();
  for (const part of text.split(/[\s,;]+/).filter(Boolean)) {
    const range = /^(\d+)-(\d+)$/.exec(part);
    if (range) {
      for (let n = Number(range[1]); n <= Number(range[2]); n += 1) if (n >= 1 && n <= count) chosen.add(n);
    } else if (/^\d+$/.test(part) && Number(part) >= 1 && Number(part) <= count) chosen.add(Number(part));
    else return null; // something that is not a number: ask again
  }
  return [...chosen].sort((a, b) => a - b);
}

export const notesText = (items, numbers) => numbers.map((n) => `- ${items[n - 1].subject}`).join("\n") + "\n";

function git(args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
}

async function main(file) {
  let range = [];
  try {
    range = [`${git(["describe", "--tags", "--abbrev=0"]).trim()}..HEAD`];
  } catch {
    // no tag yet: the whole history
  }
  const items = parseLog(git(["log", "--format=%h %s", ...range]));
  if (items.length === 0) {
    console.log("No commits since the last release to choose from.");
    return;
  }
  console.log("\nCommits since the last release (newest first):\n");
  items.forEach((item, i) => console.log(`  ${String(i + 1).padStart(2)}. ${item.subject}`));
  console.log("");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  let numbers = null;
  while (numbers === null) {
    numbers = parseSelection(await rl.question("Which go into the release notes? (e.g. 1 3 5, 2-4, a = all, Enter = use release-message.txt): "), items.length);
    if (numbers === null) console.log("Type numbers, a range such as 2-4, or a.");
  }
  rl.close();
  if (numbers.length === 0) return;
  writeFileSync(file, notesText(items, numbers));
  console.log(`\nRelease notes (${numbers.length}):\n${notesText(items, numbers)}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node scripts/release-notes.js <notes-file>");
    process.exit(1);
  }
  await main(file);
}
