import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCompareRuns } from "../public/js/compare-page.js";

test("loadCompareRuns keeps the order and lists the runs that cannot be opened", async () => {
  const runs = { a: { id: "a", title: "A" }, c: { id: "c", title: "C" } };
  const loader = async (id) => (runs[id] ? { run: runs[id], source: "local" } : null);
  const out = await loadCompareRuns(["c", "b", "a"], loader);
  assert.deepEqual(out.runs.map((r) => r.id), ["c", "a"]);
  assert.deepEqual(out.missing, ["b"]);
});

test("a loader that throws counts as missing", async () => {
  const out = await loadCompareRuns(["a"], async () => {
    throw new Error("boom");
  });
  assert.deepEqual(out, { runs: [], missing: ["a"] });
});
