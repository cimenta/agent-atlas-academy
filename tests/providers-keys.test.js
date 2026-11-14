import { test } from "node:test";
import assert from "node:assert/strict";
import { createVault } from "../public/js/storage/key-vault.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { migrateGeminiKey } from "../public/js/storage/gemini-slots.js";
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
  // An older backup marked its one Gemini key as free with a setting: that key goes to the free slot.
  assert.equal(target.forProvider("google-free").hasStoredKey(), true);
  assert.equal(target.forProvider("google").hasStoredKey(), false);
});

test("a backup carries the free and the paid Gemini key separately", async () => {
  const vault = vaultOn(memoryStorage());
  await vault.forProvider("google").remember(GOOGLE, PASS);
  await vault.forProvider("google-free").remember("AIzaFREEKEY1234567890abcdefgh", PASS);
  const backup = exportBackup({ runs: [], settings: {}, googleRecord: vault.forProvider("google").exportRecord(), googleFreeRecord: vault.forProvider("google-free").exportRecord(), includeKey: true, appVersion: "t" });
  assert.ok(backup.vaultGoogle && backup.vaultGoogleFree);
  assert.equal(parseBackup(JSON.stringify({ ...backup, vaultGoogleFree: { v: 2 } })).ok, false);
  const target = vaultOn(memoryStorage());
  await applyBackup(parseBackup(JSON.stringify(backup)).backup, { runStore: createRunStore(createMemoryBackend()), settingsStore: createSettingsStore(memoryStorage()), vault: target, mode: "merge" });
  assert.equal(await target.forProvider("google").unlock(PASS), GOOGLE);
  assert.equal(await target.forProvider("google-free").unlock(PASS), "AIzaFREEKEY1234567890abcdefgh");
});

test("a saved key from before the two slots moves to the free slot when it was marked free", async () => {
  const storage = memoryStorage();
  await vaultOn(storage).forProvider("google").remember(GOOGLE, PASS);
  const settings = createSettingsStore(storage);
  settings.setFreeTier("google", true);
  assert.equal(migrateGeminiKey({ storage, settings }), true);
  const vault = vaultOn(storage);
  assert.equal(vault.forProvider("google").hasStoredKey(), false);
  assert.equal(await vault.forProvider("google-free").unlock(PASS), GOOGLE);
  assert.equal(settings.get().freeTier.google, false);
  assert.equal(migrateGeminiKey({ storage, settings }), false);
});

test("a paid key stays in the paid slot and needsUnlock sees a locked free key", async () => {
  const storage = memoryStorage();
  const first = vaultOn(storage);
  await first.forProvider("google").remember(GOOGLE, PASS);
  assert.equal(migrateGeminiKey({ storage, settings: createSettingsStore(storage) }), false);
  assert.equal(vaultOn(storage).forProvider("google").hasStoredKey(), true);
  await first.forProvider("google-free").remember("AIzaFREEKEY1234567890abcdefgh", PASS);
  const second = vaultOn(storage);
  assert.equal(needsUnlock(second), true);
  await second.unlockAll(PASS);
  assert.equal(needsUnlock(second), false);
});

test("unlockAll unlocks every saved key with the same passphrase", async () => {
  const storage = memoryStorage();
  const first = vaultOn(storage);
  await first.remember(ANTHROPIC, PASS);
  await first.forProvider("google").remember(GOOGLE, PASS);
  const second = vaultOn(storage);
  assert.equal(needsUnlock(second), true);
  await second.unlockAll(PASS);
  assert.equal(second.getSessionKey(), ANTHROPIC);
  assert.equal(second.forProvider("google").getSessionKey(), GOOGLE);
  assert.equal(needsUnlock(second), false);
});

test("unlockAll keeps a key with another passphrase locked, and fails when nothing opens", async () => {
  const storage = memoryStorage();
  const first = vaultOn(storage);
  await first.remember(ANTHROPIC, PASS);
  await first.forProvider("google").remember(GOOGLE, "another passphrase");
  const second = vaultOn(storage);
  await second.unlockAll(PASS);
  assert.equal(second.getSessionKey(), ANTHROPIC);
  assert.equal(second.forProvider("google").getSessionKey(), null);
  await assert.rejects(vaultOn(storage).unlockAll("nothing like it"), (e) => e.code === "wrong");
});
