import { test } from "node:test";
import assert from "node:assert/strict";
import { createVault } from "../public/js/storage/key-vault.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { needsUnlock } from "../public/js/unlock-alert.js";
import { exportBackup, parseBackup, applyBackup } from "../public/js/storage/backup.js";
import { createMemoryBackend, createRunStore } from "../public/js/storage/runs-store.js";

const ANTHROPIC = "sk-ant-api03-VAULTTESTKEY1234567890";
const GOOGLE = "AIzaSyVAULTTESTKEY1234567890abcdef";
const PASS = "correct horse battery";

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
const vaultOn = (storage) => createVault({ storage, iterations: 1000 });

test("each provider has its own key in memory and in storage", async () => {
  const storage = memoryStorage();
  const vault = vaultOn(storage);
  await vault.remember(ANTHROPIC, PASS);
  const google = vault.forProvider("google");
  assert.equal(google.hasStoredKey(), false);
  assert.equal(google.getSessionKey(), null);
  await google.remember(GOOGLE, PASS);
  assert.equal(vault.getSessionKey(), ANTHROPIC);
  assert.equal(google.getSessionKey(), GOOGLE);
  assert.ok(storage.getItem("aa.vault"));
  assert.ok(storage.getItem("aa.vault.google"));
  assert.ok(!storage.getItem("aa.vault.google").includes(GOOGLE));
});

test("forProvider returns the same object each time and the vault itself for anthropic", () => {
  const vault = vaultOn(memoryStorage());
  assert.equal(vault.forProvider("anthropic"), vault);
  assert.equal(vault.forProvider("google"), vault.forProvider("google"));
});

test("a Google key unlocks after a reload with its passphrase, and forgetting one leaves the other", async () => {
  const storage = memoryStorage();
  const first = vaultOn(storage);
  await first.remember(ANTHROPIC, PASS);
  await first.forProvider("google").remember(GOOGLE, PASS);
  const second = vaultOn(storage);
  assert.equal(await second.forProvider("google").unlock(PASS), GOOGLE);
  second.forProvider("google").forget();
  assert.equal(second.forProvider("google").hasStoredKey(), false);
  assert.equal(second.hasStoredKey(), true);
});

test("needsUnlock is true when any provider has a locked key", async () => {
  const storage = memoryStorage();
  const first = vaultOn(storage);
  await first.forProvider("google").remember(GOOGLE, PASS);
  const second = vaultOn(storage);
  assert.equal(needsUnlock(second), true);
  await second.forProvider("google").unlock(PASS);
  assert.equal(needsUnlock(second), false);
});

test("the free tier setting is kept per provider and defaults to off", () => {
  const storage = memoryStorage();
  const settings = createSettingsStore(storage);
  assert.equal(settings.get().freeTier.google, false);
  settings.setFreeTier("google", true);
  assert.equal(createSettingsStore(storage).get().freeTier.google, true);
  settings.setFreeTier("google", false);
  assert.equal(settings.get().freeTier.google, false);
  settings.setFreeTier("nope", true);
  assert.equal(settings.get().freeTier.nope, undefined);
});

test("a backup can carry the Google key record and the free tier choice", async () => {
  const storage = memoryStorage();
  const vault = vaultOn(storage);
  await vault.forProvider("google").remember(GOOGLE, PASS);
  const record = vault.forProvider("google").exportRecord();
  const backup = exportBackup({ runs: [], settings: { freeTier: { google: true } }, vaultRecord: null, googleRecord: record, includeKey: true, appVersion: "t" });
  assert.ok(backup.vaultGoogle);
  assert.ok(!JSON.stringify(backup).includes(GOOGLE));
  assert.equal(exportBackup({ runs: [], settings: {}, googleRecord: record, includeKey: false, appVersion: "t" }).vaultGoogle, undefined);

  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true);
  assert.equal(parseBackup(JSON.stringify({ ...backup, vaultGoogle: { v: 2 } })).ok, false);

  const target = vaultOn(memoryStorage());
  const settingsStore = createSettingsStore(memoryStorage());
  await applyBackup(parsed.backup, { runStore: createRunStore(createMemoryBackend()), settingsStore, vault: target, mode: "merge" });
  assert.equal(target.forProvider("google").hasStoredKey(), true);
  assert.equal(settingsStore.get().freeTier.google, true);
});
