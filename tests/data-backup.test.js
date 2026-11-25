import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryBackend, createRunStore } from "../public/js/storage/runs-store.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { createVault } from "../public/js/storage/key-vault.js";
import { createSkillsStore } from "../public/js/storage/skills-store.js";
import { createVerdictStore } from "../public/js/compare-verdict.js";
import { decryptText, isEncryptedText } from "../public/js/storage/file-crypto.js";
import { DEFAULTS, normalize, observe, backupDue, reminderDue, backupFileName, writeToFolder, createBackupService, readState, writeState, fingerprint } from "../public/js/data-backup.js";

const MIN = 60000;
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
};
const state = (o = {}) => ({ ...DEFAULTS, ...o });

test("a stored state that is damaged or odd falls back to the defaults", () => {
  assert.deepEqual(normalize(null), DEFAULTS);
  assert.deepEqual(normalize({ mode: "yes", interval: 7, quiet: 3, gap: "x", changes: -2, autoKeys: "true" }), DEFAULTS);
  assert.equal(normalize({ mode: "auto", trigger: "change", quiet: 5 }).quiet, 5);
  const storage = memory();
  storage.setItem("aa.data.backup", "not json");
  assert.deepEqual(readState(storage), DEFAULTS);
  writeState(storage, state({ mode: "remind", changes: 2 }));
  assert.equal(readState(storage).changes, 2);
});

test("a change is counted when the data differs from the last look, and the first look is not a change", () => {
  const first = observe(state(), "a", 1000);
  assert.equal(first.changes, 0);
  assert.equal(first.sig, "a");
  assert.equal(observe(first, "a", 2000), first, "the same data is the same state");
  const second = observe(first, "b", 3000);
  assert.equal(second.changes, 1);
  assert.equal(second.lastChange, 3000);
  assert.equal(observe(second, "c", 4000).changes, 2);
  assert.notEqual(fingerprint("abc"), fingerprint("abd"));
});

test("a backup by time is due when the interval has passed and only if something changed", () => {
  const s = state({ mode: "auto", trigger: "time", interval: 60, changes: 1, lastBackup: 10 * MIN });
  assert.equal(backupDue(s, 69 * MIN), false);
  assert.equal(backupDue(s, 70 * MIN), true);
  assert.equal(backupDue({ ...s, changes: 0 }, 500 * MIN), false, "nothing changed, nothing to back up");
  assert.equal(backupDue({ ...s, mode: "remind" }, 500 * MIN), false);
  assert.equal(backupDue({ ...s, mode: "off" }, 500 * MIN), false);
  assert.equal(backupDue({ ...s, lastBackup: 0 }, 1), true, "a first backup is due at once");
});

test("a backup after a change waits for the quiet time and the gap, so a series of changes gives one backup", () => {
  const s = state({ mode: "auto", trigger: "change", quiet: 2, gap: 10, changes: 3, lastChange: 100 * MIN, lastBackup: 95 * MIN });
  assert.equal(backupDue(s, 101 * MIN), false, "the data was changed a minute ago");
  assert.equal(backupDue(s, 102 * MIN), false, "quiet for 2 minutes, but the last backup is only 7 minutes old");
  assert.equal(backupDue(s, 105 * MIN), true, "quiet, and 10 minutes since the last backup");
  assert.equal(backupDue({ ...s, lastChange: 104 * MIN }, 105 * MIN), false, "a new change restarts the quiet time");
  assert.equal(backupDue({ ...s, lastBackup: 0, lastChange: 100 * MIN }, 102 * MIN), true, "no gap before a first backup");
});

test("the reminder shows after enough changes, in the mode remind only", () => {
  assert.equal(reminderDue(state({ mode: "remind", remindAfter: 5, changes: 4 })), false);
  assert.equal(reminderDue(state({ mode: "remind", remindAfter: 5, changes: 5 })), true);
  assert.equal(reminderDue(state({ mode: "auto", changes: 50 })), false);
  assert.equal(reminderDue(state({ mode: "off", changes: 50 })), false);
});

test("the file name sorts by time", () => {
  assert.equal(backupFileName(new Date(2026, 10, 25, 14, 5)), "agent-atlas-backup-2026-11-25-1405.json");
  assert.ok(backupFileName(new Date(2026, 10, 25, 14, 5)) < backupFileName(new Date(2026, 10, 25, 14, 30)));
});

function fakeFolder(existing = []) {
  const files = new Map(existing.map((n) => [n, "old"]));
  return {
    files,
    name: "Backups",
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    getFileHandle: async (name) => ({ createWritable: async () => ({ write: async (text) => files.set(name, text), close: async () => {} }) }),
    removeEntry: async (name) => void files.delete(name),
    async *entries() {
      for (const name of files.keys()) yield [name, { kind: "file" }];
    },
  };
}

test("a backup file is written to the folder, and only the newest five of our own files are kept", async () => {
  const names = ["a-1", "agent-atlas-backup-2026-01-01-0000.json", "agent-atlas-backup-2026-01-02-0000.json", "agent-atlas-backup-2026-01-03-0000.json", "agent-atlas-backup-2026-01-04-0000.json", "agent-atlas-backup-2026-01-05-0000.json"];
  const folder = fakeFolder(names);
  await writeToFolder(folder, "agent-atlas-backup-2026-01-06-0000.json", "NEW");
  assert.equal(folder.files.get("agent-atlas-backup-2026-01-06-0000.json"), "NEW");
  assert.equal(folder.files.has("agent-atlas-backup-2026-01-01-0000.json"), false, "the oldest is removed");
  assert.equal(folder.files.has("agent-atlas-backup-2026-01-02-0000.json"), true);
  assert.equal(folder.files.has("a-1"), true, "a file that is not ours is never touched");
});

function service(extra = {}) {
  const storage = memory();
  const runStore = createRunStore(createMemoryBackend());
  const settings = createSettingsStore(storage);
  const vault = createVault({ storage, iterations: 1000 });
  const skills = createSkillsStore(storage);
  const verdictStore = createVerdictStore(storage);
  const folder = fakeFolder();
  let handle = folder;
  const folderStore = { supported: () => true, get: async () => handle, set: async (h) => void (handle = h), clear: async () => void (handle = null) };
  let clock = 1000 * MIN;
  const svc = createBackupService({ storage, runStore, settings, skills, vault, vaultOf: (id) => vault.forProvider(id), verdictStore, folderStore, getVersion: () => "9.9.9", now: () => clock, ...extra });
  return { svc, folder, skills, storage, advance: (min) => (clock += min * MIN), folderStore, setHandle: (h) => (handle = h) };
}

test("the service counts a change, waits for the rule, then writes one backup and starts counting again", async () => {
  const w = service();
  w.svc.update({ mode: "auto", trigger: "time", interval: 15 });
  await w.svc.tick();
  assert.equal(w.svc.state().changes, 0, "the first look is not a change");
  w.skills.add({ id: "u-a", kind: "styl", name: "A", text: "a" });
  await w.svc.tick();
  assert.equal(w.folder.files.size, 1, "a first backup is due at once, there was none before");
  const text = [...w.folder.files.values()][0];
  assert.equal(JSON.parse(text).appVersion, "9.9.9");
  assert.equal(w.svc.state().changes, 0);
  w.skills.add({ id: "u-b", kind: "styl", name: "B", text: "b" });
  w.advance(5);
  await w.svc.tick();
  assert.equal(w.folder.files.size, 1, "5 minutes later the 15 minute interval has not passed");
  assert.equal(w.svc.state().changes, 1);
  w.advance(11);
  await w.svc.tick();
  assert.equal(w.folder.files.size, 2);
  assert.equal(w.svc.state().changes, 0);
});

test("an unchanged data is not backed up again, and a backup can be requested by hand", async () => {
  const w = service();
  w.svc.update({ mode: "auto", trigger: "time", interval: 15 });
  await w.svc.tick();
  w.advance(100);
  await w.svc.tick();
  assert.equal(w.folder.files.size, 0, "nothing changed");
  assert.deepEqual(await w.svc.backupNow(), { ok: true });
  assert.equal(w.folder.files.size, 1);
});

test("the mode off and the mode remind never write a file by themselves", async () => {
  for (const mode of ["off", "remind"]) {
    const w = service();
    w.svc.update({ mode });
    await w.svc.tick();
    w.skills.add({ id: "u-a", kind: "styl", name: "A", text: "a" });
    w.advance(1000);
    await w.svc.tick();
    assert.equal(w.folder.files.size, 0, mode);
    assert.equal(w.svc.state().changes, 1);
  }
});

test("without a folder, or without permission, nothing is written and the reason is given", async () => {
  const w = service();
  w.setHandle(null);
  assert.deepEqual(await w.svc.backupNow(), { ok: false, reason: "no-folder" });
  const denied = fakeFolder();
  denied.queryPermission = async () => "prompt";
  denied.requestPermission = async () => "denied";
  w.setHandle(denied);
  assert.deepEqual(await w.svc.backupNow(), { ok: false, reason: "permission" });
  assert.equal(w.svc.error(), "permission");
  denied.requestPermission = async () => "granted";
  assert.deepEqual(await w.svc.backupNow({ interactive: true }), { ok: true });
  assert.equal(w.svc.error(), "");
});

test("keys go into a backup only when chosen, and then only with a password, and the file is encrypted", async () => {
  const w = service();
  w.svc.update({ autoKeys: true });
  assert.deepEqual(await w.svc.backupNow(), { ok: false, reason: "need-password" });
  w.svc.setPassword("a long password");
  assert.deepEqual(await w.svc.backupNow(), { ok: true });
  const text = [...w.folder.files.values()][0];
  assert.equal(isEncryptedText(text), true);
  const plain = JSON.parse(await decryptText(text, "a long password"));
  assert.ok(plain.categories.includes("keys"));
  const other = service();
  assert.deepEqual(await other.svc.backupNow(), { ok: true });
  assert.equal(JSON.parse([...other.folder.files.values()][0]).categories.includes("keys"), false, "keys are off by default");
});

test("an export by hand starts the reminder again", async () => {
  const w = service();
  w.svc.update({ mode: "remind", remindAfter: 3 });
  await w.svc.tick();
  w.skills.add({ id: "u-a", kind: "styl", name: "A", text: "a" });
  await w.svc.tick();
  assert.equal(w.svc.state().changes, 1);
  w.svc.markExported();
  assert.equal(w.svc.state().changes, 0);
});
