import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { isYes } from "../scripts/confirm.js";

test("with the default set to no, Enter means no and only y or yes is yes", () => {
  for (const a of ["", "  ", "n", "x"]) assert.equal(isYes(a, { defaultYes: false }), false, JSON.stringify(a));
  for (const a of ["y", "Y", " yes "]) assert.equal(isYes(a, { defaultYes: false }), true, a);
});

test("Enter, y and yes mean yes, and anything else means no", () => {
  for (const a of ["", "  ", "y", "Y", "yes", " Yes "]) assert.equal(isYes(a), true, JSON.stringify(a));
  for (const a of ["n", "no", "x", "nope", "1"]) assert.equal(isYes(a), false, a);
});

const ask = (input) => spawnSync(process.execPath, [new URL("../scripts/confirm.js", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "Go? "], { input, encoding: "utf8" });

test("the script exits 0 on Enter, 1 on n, and 1 when the input closes without an answer", () => {
  assert.equal(ask("\n").status, 0);
  assert.equal(ask("y\n").status, 0);
  assert.equal(ask("n\n").status, 1);
  assert.equal(ask("").status, 1, "no answer at all (Ctrl+C, or a closed input) cancels");
});
