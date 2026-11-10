import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../public/js/router.js";

test("empty hashes open the home page", () => {
  for (const hash of ["", "#", "#/"]) assert.deepEqual(parseRoute(hash), { name: "home", params: {} }, hash);
  assert.deepEqual(parseRoute(undefined), { name: "home", params: {} });
});

test("#/play opens the replay view of Play", () => {
  assert.deepEqual(parseRoute("#/play"), { name: "play", params: { view: "replay" } });
});

test("the Play sub-tabs have their own routes", () => {
  assert.deepEqual(parseRoute("#/play/create"), { name: "play", params: { view: "create" } });
  assert.deepEqual(parseRoute("#/play/result"), { name: "play", params: { view: "result" } });
  assert.deepEqual(parseRoute("#/play/result/local-abc-12"), { name: "play", params: { view: "result", id: "local-abc-12" } });
  assert.deepEqual(parseRoute("#/play/run/local-abc-12"), { name: "play", params: { view: "run", id: "local-abc-12" } });
});

test("run ids must be lowercase slugs and sub-routes cannot nest further", () => {
  for (const hash of ["#/play/run/UPPER", "#/play/run/a/b", "#/play/run", "#/play/result/a/b", "#/play/create/x", "#/play/run/a_b"]) {
    assert.equal(parseRoute(hash).name, "notfound", hash);
  }
});

test("the settings page has a route", () => {
  assert.deepEqual(parseRoute("#/settings"), { name: "settings", params: {} });
  assert.equal(parseRoute("#/settings/x").name, "notfound");
});

test("the simple pages are recognised", () => {
  assert.equal(parseRoute("#/help").name, "help");
  assert.equal(parseRoute("#/about").name, "about");
  assert.equal(parseRoute("#/learn").name, "learn");
});

test("an article route carries its slug", () => {
  assert.deepEqual(parseRoute("#/learn/sequential-chain"), {
    name: "article",
    params: { slug: "sequential-chain" },
  });
});

test("only the legal pages are accepted under #/page", () => {
  for (const name of ["privacy", "terms", "imprint"]) {
    assert.deepEqual(parseRoute(`#/page/${name}`), { name: "page", params: { name } });
  }
  assert.equal(parseRoute("#/page/secret").name, "notfound");
});

test("anything unexpected is not found", () => {
  for (const hash of [
    "#/nonsense",
    "#/learn/../etc",
    "#/learn/Bad_Slug",
    "#/learn/a/b",
    "#/learn/a/b/c",
    "#/play/x",
    "#/help/x",
    "#/page",
    "#//",
    undefined,
    null,
    42,
  ]) {
    const expected = hash === undefined || hash === null || hash === 42 ? "home" : "notfound";
    assert.equal(parseRoute(hash).name, expected, String(hash));
  }
});
