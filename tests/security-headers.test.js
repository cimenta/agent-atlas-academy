import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(readFileSync(join(appDir, "vercel.json"), "utf8"));
const rule = config.headers.find((h) => h.source === "/(.*)");
const header = (key) => rule.headers.find((h) => h.key.toLowerCase() === key.toLowerCase())?.value;

test("vercel.json applies headers to every path", () => {
  assert.ok(rule, "a header rule for /(.*) must exist");
});

test("Content-Security-Policy is strict and same-origin", () => {
  const csp = header("Content-Security-Policy");
  for (const part of [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ]) {
    assert.ok(csp.includes(part), `CSP must contain ${part}`);
  }
  assert.ok(!csp.includes("unsafe-inline"), "no unsafe-inline");
  assert.ok(!csp.includes("unsafe-eval"), "no unsafe-eval");
});

test("transport, sniffing, referrer and permission headers are set", () => {
  assert.match(header("Strict-Transport-Security"), /max-age=63072000/);
  assert.equal(header("X-Content-Type-Options"), "nosniff");
  assert.equal(header("Referrer-Policy"), "no-referrer");
  const permissions = header("Permissions-Policy");
  for (const part of ["camera=()", "microphone=()", "geolocation=()"]) {
    assert.ok(permissions.includes(part), `Permissions-Policy must contain ${part}`);
  }
});

test("the run function may stream for five minutes", () => {
  assert.equal(config.functions["api/run.js"].maxDuration, 300);
});

test("build settings point at the static output", () => {
  assert.equal(config.buildCommand, "npm run build");
  assert.equal(config.outputDirectory, "public");
});
