import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findPlaceholders } from "../scripts/check-release.js";

function makeDir(files) {
  const dir = mkdtempSync(join(tmpdir(), "aa-release-"));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, ".."), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

test("finds one marker in public/", () => {
  const dir = makeDir({ "public/a.md": "Name: [[OWNER: full name]]", "README.md": "ok", "SECURITY.md": "ok" });
  const found = findPlaceholders(dir);
  assert.equal(found.length, 1);
  assert.match(found[0].file, /a\.md$/);
  assert.equal(found[0].marker, "[[OWNER: full name]]");
});

test("finds markers in README.md and SECURITY.md", () => {
  const dir = makeDir({ "README.md": "[[OWNER: x]]", "SECURITY.md": "[[OWNER: y]]", "public/b.md": "clean" });
  assert.equal(findPlaceholders(dir).length, 2);
});

test("returns [] for a clean folder", () => {
  const dir = makeDir({ "public/a.md": "fine", "README.md": "fine", "SECURITY.md": "fine" });
  assert.deepEqual(findPlaceholders(dir), []);
});
