import { test } from "node:test";
import assert from "node:assert/strict";
import { createVault } from "../public/js/storage/key-vault.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { exportBackup, parseBackup, applyBackup, backupVaultRecords } from "../public/js/storage/backup.js";
import { createMemoryBackend, createRunStore } from "../public/js/storage/runs-store.js";

const PASS = "correct horse battery";
const FREE = "gsk_FREEKEY1234567890abcdefghijkl";
const PAID = "gsk_PAIDKEY1234567890abcdefghijkl";

function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => void map.set(k, String(v)), removeItem: (k) => map.delete(k) };
}
const vaultOn = (storage) => createVault({ storage, iterations: 1000 });
const apply = (backup, vault, mode = "merge") => applyBackup(backup, { runStore: createRunStore(createMemoryBackend()), settingsStore: createSettingsStore(memoryStorage()), vault, mode });

test("a backup carries the Groq key slots and puts them back", async () => {
  const vault = vaultOn(memoryStorage());
  await vault.forProvider("groq-free").remember(FREE, PASS);
  await vault.forProvider("groq").remember(PAID, PASS);
  const records = backupVaultRecords((id) => vault.forProvider(id));
  const backup = exportBackup({ runs: [], settings: {}, ...records, includeKey: true, appVersion: "t" });
  assert.ok(backup.vaultSlots["groq-free"] && backup.vaultSlots.groq);
  assert.ok(!JSON.stringify(backup).includes(FREE) && !JSON.stringify(backup).includes(PAID));
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true);
  const target = vaultOn(memoryStorage());
  await apply(parsed.backup, target);
  assert.equal(await target.forProvider("groq-free").unlock(PASS), FREE);
  assert.equal(await target.forProvider("groq").unlock(PASS), PAID);
});

test("the key is left out when the box is not ticked, and an older backup without slots still applies", async () => {
  const vault = vaultOn(memoryStorage());
  await vault.forProvider("groq-free").remember(FREE, PASS);
  const records = backupVaultRecords((id) => vault.forProvider(id));
  assert.equal(exportBackup({ runs: [], settings: {}, ...records, includeKey: false, appVersion: "t" }).vaultSlots, undefined);
  const old = parseBackup(JSON.stringify({ backupVersion: 1, appVersion: "old", settings: {}, runs: [] }));
  assert.equal(old.ok, true);
  await apply(old.backup, vaultOn(memoryStorage()));
});

test("an invalid slot record is refused and an unknown slot is ignored", async () => {
  const base = { backupVersion: 1, appVersion: "t", settings: {}, runs: [] };
  assert.equal(parseBackup(JSON.stringify({ ...base, vaultSlots: { "groq-free": { v: 2 } } })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ ...base, vaultSlots: [] })).ok, false);
  const vault = vaultOn(memoryStorage());
  await vault.forProvider("groq-free").remember(FREE, PASS);
  const record = vault.forProvider("groq-free").exportRecord();
  const parsed = parseBackup(JSON.stringify({ ...base, vaultSlots: { nowhere: record } }));
  assert.equal(parsed.ok, true);
  const target = vaultOn(memoryStorage());
  await apply(parsed.backup, target);
  assert.equal(target.forProvider("groq-free").hasStoredKey(), false);
});

test("merge keeps a Groq key that is already saved, replace takes the backup one", async () => {
  const source = vaultOn(memoryStorage());
  await source.forProvider("groq-free").remember(FREE, PASS);
  const backup = exportBackup({ runs: [], settings: {}, ...backupVaultRecords((id) => source.forProvider(id)), includeKey: true, appVersion: "t" });
  const target = vaultOn(memoryStorage());
  await target.forProvider("groq-free").remember("gsk_OTHERKEY1234567890abcdefghijk", PASS);
  await apply(parseBackup(JSON.stringify(backup)).backup, target, "merge");
  assert.equal(await target.forProvider("groq-free").unlock(PASS), "gsk_OTHERKEY1234567890abcdefghijk");
  await apply(parseBackup(JSON.stringify(backup)).backup, target, "replace");
  assert.equal(await target.forProvider("groq-free").unlock(PASS), FREE);
});
