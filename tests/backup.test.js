import { test } from "node:test";
import assert from "node:assert/strict";
import { BACKUP_VERSION, exportBackup, parseBackup, applyBackup } from "../public/js/storage/backup.js";
import { createMemoryBackend, createRunStore } from "../public/js/storage/runs-store.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { createVault } from "../public/js/storage/key-vault.js";
import { buildRunRecord } from "../public/js/engine/run-record.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const design = {
  pattern: "sequential",
  nodes: [
    { id: "planner", agent: "planner", model: "fast", search: false },
    { id: "writer", agent: "writer", model: "fast", search: false },
  ],
  edges: [{ from: "planner", to: "writer" }],
};

function makeRun(id, text = "ok") {
  const events = [
    { t: 0, type: "run_start", task: "A task", pattern: "sequential", design },
    { t: 1, type: "agent_start", agent: "planner", role: "Planner" },
    { t: 2, type: "agent_output", agent: "planner", text, tokens: { input: 5, output: 5 } },
    { t: 3, type: "done", outcome: "finished", usage: { input: 5, output: 5, searches: 0, steps: 1 }, finalText: text },
  ];
  return buildRunRecord({ id, design, task: "A task", events, limits: LIMIT_DEFAULTS, language: "en", appVersion: "0.3.0" });
}

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => void map.delete(k) };
}

const KEY = "sk-ant-api03-BACKUPSECRETKEY123456";
async function vaultWithKey() {
  const storage = memoryStorage();
  const vault = createVault({ storage, iterations: 1000 });
  await vault.remember(KEY, "a long passphrase");
  return { storage, vault, record: JSON.parse(storage.getItem("aa.vault")) };
}

function stores() {
  const runStore = createRunStore(createMemoryBackend());
  const data = new Map();
  const settingsStore = createSettingsStore({ getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) });
  const vault = createVault({ storage: memoryStorage(), iterations: 1000 });
  return { runStore, settingsStore, vault };
}

test("an export never contains a plaintext key, even when the encrypted key is included", async () => {
  const { record } = await vaultWithKey();
  const backup = exportBackup({ runs: [makeRun("local-a")], settings: { limits: LIMIT_DEFAULTS }, vaultRecord: record, includeKey: true, appVersion: "0.3.0" });
  const json = JSON.stringify(backup);
  assert.ok(!json.includes("BACKUPSECRETKEY"));
  assert.ok(!json.includes("a long passphrase"));
  assert.deepEqual(backup.vault, record);
  assert.equal(backup.backupVersion, BACKUP_VERSION);
});

test("includeKey false leaves the vault out", async () => {
  const { record } = await vaultWithKey();
  const backup = exportBackup({ runs: [], settings: {}, vaultRecord: record, includeKey: false, appVersion: "0.3.0" });
  assert.equal("vault" in backup, false);
  assert.equal("vault" in exportBackup({ runs: [], settings: {}, vaultRecord: null, includeKey: true, appVersion: "0.3.0" }), false);
});

test("export, parse and apply into an empty store restores every run and the limits", async () => {
  const backup = exportBackup({ runs: [makeRun("local-a"), makeRun("local-b")], settings: { limits: { maxSteps: 7, maxTokens: 9000, maxSearches: 1 } }, appVersion: "0.3.0" });
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true);
  const s = stores();
  const result = await applyBackup(parsed.backup, { ...s, mode: "merge" });
  assert.deepEqual(result, { added: 2, skipped: 0, failed: 0 });
  assert.deepEqual((await s.runStore.list()).map((r) => r.id).sort(), ["local-a", "local-b"]);
  assert.deepEqual(s.settingsStore.get().limits, { maxSteps: 7, maxTokens: 9000, maxSearches: 1 });
});

test("merge skips runs that already exist and counts them", async () => {
  const s = stores();
  await s.runStore.save(makeRun("local-a", "mine"));
  const backup = exportBackup({ runs: [makeRun("local-a", "theirs"), makeRun("local-b")], settings: {}, appVersion: "0.3.0" });
  const result = await applyBackup(parseBackup(JSON.stringify(backup)).backup, { ...s, mode: "merge" });
  assert.deepEqual(result, { added: 1, skipped: 1, failed: 0 });
  assert.equal((await s.runStore.get("local-a")).events[2].text, "mine");
});

test("replace clears the existing runs first", async () => {
  const s = stores();
  await s.runStore.save(makeRun("local-old"));
  const backup = exportBackup({ runs: [makeRun("local-new")], settings: {}, appVersion: "0.3.0" });
  await applyBackup(parseBackup(JSON.stringify(backup)).backup, { ...s, mode: "replace" });
  assert.deepEqual((await s.runStore.list()).map((r) => r.id), ["local-new"]);
});

test("a run with a bad shape fails the whole import with a list of problems", async () => {
  const bad = { ...makeRun("local-bad"), events: [] };
  const backup = exportBackup({ runs: [makeRun("local-ok"), bad], settings: {}, appVersion: "0.3.0" });
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, false);
  assert.ok(parsed.errors.length > 0);
  assert.ok(parsed.errors.some((e) => e.includes("local-bad")));
});

test("oversized, non-JSON and wrong-version backups are rejected", () => {
  assert.equal(parseBackup("x".repeat(26 * 1024 * 1024)).ok, false);
  assert.equal(parseBackup("not json").ok, false);
  assert.equal(parseBackup(JSON.stringify({ backupVersion: 99, runs: [] })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ backupVersion: 1, runs: "nope" })).ok, false);
  assert.equal(parseBackup(JSON.stringify([1, 2])).ok, false);
});

test("a vault that is not the vault record shape is rejected", () => {
  const backup = exportBackup({ runs: [], settings: {}, appVersion: "0.3.0" });
  backup.vault = { v: 1, ciphertext: 42 };
  assert.equal(parseBackup(JSON.stringify(backup)).ok, false);
});

test("markup in run text comes through unchanged as data", async () => {
  const text = '<img src=x onerror="alert(1)">';
  const backup = exportBackup({ runs: [makeRun("local-x", text)], settings: {}, appVersion: "0.3.0" });
  const parsed = parseBackup(JSON.stringify(backup));
  const s = stores();
  await applyBackup(parsed.backup, { ...s, mode: "merge" });
  assert.equal((await s.runStore.get("local-x")).events[2].text, text);
});

test("an imported encrypted key is stored only when none exists (merge) or always (replace)", async () => {
  const { record } = await vaultWithKey();
  const backup = parseBackup(JSON.stringify(exportBackup({ runs: [], settings: {}, vaultRecord: record, includeKey: true, appVersion: "0.3.0" }))).backup;
  const s = stores();
  await applyBackup(backup, { ...s, mode: "merge" });
  assert.equal(s.vault.hasStoredKey(), true);
  assert.equal(await s.vault.unlock("a long passphrase"), KEY);
});
