import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(appDir, "public", "index.html"), "utf8");

test("the page is responsive and declares its language", () => {
  assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1">'));
  assert.match(html, /<html[^>]*lang="en"/);
});

test("there is exactly one script and it is an external module", () => {
  const scripts = html.match(/<script\b[^>]*>/gi) || [];
  assert.equal(scripts.length, 1);
  assert.match(scripts[0], /type="module"/);
  assert.match(scripts[0], /src="/);
});

test("nothing inline that the Content Security Policy would block", () => {
  assert.ok(!/<style\b/i.test(html), "no <style> tag");
  assert.ok(!/\sstyle\s*=/i.test(html), "no style attribute");
  assert.ok(!/\son[a-z]+\s*=/i.test(html), "no event-handler attribute");
});

test("nothing is loaded from another origin", () => {
  assert.ok(!/(src|href)\s*=\s*"https?:\/\//i.test(html));
});

test("the shell has the menu, main area and footer", () => {
  assert.ok(html.includes('<nav id="menu"'));
  assert.ok(html.includes('<main id="main"'));
  assert.ok(html.includes('<footer id="footer"'));
});
