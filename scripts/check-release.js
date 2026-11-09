import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MARKER = /\[\[OWNER:[^\]]*\]\]/g;
const TEXT_FILE = /\.(md|json|html|css|js|txt)$/i;

function* walk(path) {
  const info = statSync(path, { throwIfNoEntry: false });
  if (!info) return;
  if (info.isDirectory()) {
    for (const name of readdirSync(path)) yield* walk(join(path, name));
  } else if (TEXT_FILE.test(path)) {
    yield path;
  }
}

export function findPlaceholders(dir) {
  const found = [];
  for (const target of [join(dir, "public"), join(dir, "README.md"), join(dir, "SECURITY.md")]) {
    for (const file of walk(target)) {
      for (const marker of readFileSync(file, "utf8").match(MARKER) ?? []) found.push({ file, marker });
    }
  }
  return found;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const found = findPlaceholders(root);
  if (found.length) {
    console.error(`${found.length} owner placeholder(s) still to fill in:`);
    for (const { file, marker } of found) console.error(`  ${file}: ${marker}`);
    process.exit(1);
  }
  console.log("No owner placeholders left.");
}
