import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeVersionFile } from "../scripts/build.js";

function tempDir() {
  return mkdtempSync(join(tmpdir(), "aa-version-"));
}

test("writeVersionFile writes the package version and returns it", () => {
  const dir = tempDir();
  const pkg = join(dir, "package.json");
  const out = join(dir, "version.json");
  writeFileSync(pkg, JSON.stringify({ version: "1.2.3" }));
  const returned = writeVersionFile(pkg, out);
  assert.equal(returned, "1.2.3");
  assert.deepEqual(JSON.parse(readFileSync(out, "utf8")), { version: "1.2.3" });
});

test("writeVersionFile throws when the version is not MAJOR.MINOR.PATCH", () => {
  const dir = tempDir();
  const pkg = join(dir, "package.json");
  writeFileSync(pkg, JSON.stringify({ version: "1.2" }));
  assert.throws(() => writeVersionFile(pkg, join(dir, "version.json")), /semantic/i);
});
