import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The code asks the registry (engine/providers.js) about providers; it does not name them.
// Not scanned: the registry, key-slots.js, and the migration code that is about Gemini by nature
// (storage/gemini-slots.js, storage/backup.js, main.js).
const FILES = [

  "../lib/run-handler.js",
  "../public/js/engine/cost.js",
  "../public/js/provider-colors.js",
  "../public/js/replay/retry-choice.js",
  "../public/js/replay/view.js",
  "../public/js/storage/settings.js",
  "../public/js/storage/key-vault.js",
  "../public/js/settings-page.js",
  "../public/js/create/create-page.js",
];
const FORBIDDEN = [/[=!]==\s*"(google|anthropic)"/, /\["anthropic",\s*"google"\]/, /"google-free"/, /\bGOOGLE_MODELS\b/];

test("no provider is named in the code that reads the registry", () => {
  for (const f of FILES) {
    const source = readFileSync(new URL(f, import.meta.url), "utf8");
    source.split(/\r?\n/).forEach((line, i) => {
      if (line.trim().startsWith("//")) return;
      for (const pattern of FORBIDDEN) assert.ok(!pattern.test(line), `${f}:${i + 1} names a provider: ${line.trim().slice(0, 100)}`);
    });
  }
});
