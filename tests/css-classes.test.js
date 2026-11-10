import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

test("styles that the page depends on are present", () => {
  for (const selector of [".about-panel", ".about-title", ".about-description", ".about-buttons", "a.has-result", ".center-tip", ".center-tip-link", ".round-badge", ".run-menu-list", ".cog-button"]) {
    assert.ok(css.includes(selector), `styles.css has no rule for ${selector}`);
  }
  assert.ok(/--result-bg:/.test(css) && /--result-text:/.test(css));
});
