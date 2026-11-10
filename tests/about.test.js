import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateRun, ABOUT_LIMITS } from "../public/js/run-schema.js";
import { cleanAbout, isHttpUrl } from "../public/js/replay/about.js";

const sample = () => JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "fixtures", "sample-run.json"), "utf8"));
const withAbout = (about) => ({ ...sample(), about });

test("a run without an about section is valid, and so is a full one", () => {
  assert.equal(validateRun(sample()).ok, true);
  assert.equal(validateRun(withAbout({ title: "T", author: "A", url: "https://example.com/x", description: "# Hi\n\nSome *text*." })).ok, true);
  assert.equal(validateRun(withAbout({})).ok, true);
});

test("a bad about section is refused", () => {
  assert.equal(validateRun(withAbout("text")).ok, false);
  assert.equal(validateRun(withAbout({ title: 5 })).ok, false);
  assert.equal(validateRun(withAbout({ colour: "red" })).ok, false);
  assert.equal(validateRun(withAbout({ description: "x".repeat(ABOUT_LIMITS.description + 1) })).ok, false);
  assert.equal(validateRun(withAbout({ url: "javascript:alert(1)" })).ok, false);
  assert.equal(validateRun(withAbout({ url: "ftp://example.com" })).ok, false);
});

test("cleanAbout trims, drops empty fields and returns null when nothing is left", () => {
  assert.deepEqual(cleanAbout({ title: "  T  ", author: "", url: " ", description: "d" }), { title: "T", description: "d" });
  assert.equal(cleanAbout({ title: " ", author: "" }), null);
  assert.equal(cleanAbout(undefined), null);
});

test("only http and https links are accepted", () => {
  assert.equal(isHttpUrl("https://example.com/a?b=1"), true);
  assert.equal(isHttpUrl("http://example.com"), true);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
  assert.equal(isHttpUrl("example.com"), false);
  assert.equal(isHttpUrl("https://exa mple.com"), false);
});
