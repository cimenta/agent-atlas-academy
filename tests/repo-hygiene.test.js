import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set([".git", "node_modules", "tests"]);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) files.push(...walk(full));
    else files.push(full);
  }
  return files;
}

test("no file in the app mentions the earlier project", () => {
  const forbidden = ["add", "very"].join("");
  const hits = walk(appDir).filter((f) => {
    const text = readFileSync(f, "utf8");
    return text.toLowerCase().includes(forbidden);
  });
  assert.deepEqual(hits, []);
});

test("LICENSE is the MIT licence", () => {
  assert.match(readFileSync(join(appDir, "LICENSE"), "utf8"), /MIT License/);
});

test("the app folder holds no project management files", () => {
  for (const name of [".superpowers", "docs", "push.bat", "release.bat", "test.bat", "tmp-solution"]) {
    assert.equal(existsSync(join(appDir, name)), false, `${name} must not be in app/`);
  }
});
