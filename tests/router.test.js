import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute } from "../public/js/router.js";

test("empty hashes and #/play open the replay", () => {
  for (const hash of ["", "#", "#/", "#/play"]) {
    assert.deepEqual(parseRoute(hash), { name: "play", params: {} }, hash);
  }
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
    "#/play/x",
    "#/help/x",
    "#/page",
    "#//",
    undefined,
    null,
    42,
  ]) {
    const expected = hash === undefined || hash === null || hash === 42 ? "play" : "notfound";
    assert.equal(parseRoute(hash).name, expected, String(hash));
  }
});
