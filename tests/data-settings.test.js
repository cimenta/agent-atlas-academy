import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveObjectURL } from "node:buffer";
import { encryptText, decryptText, isEncryptedText, gzip, gunzip, isGzip, fileToText, FileCryptoError } from "../public/js/storage/file-crypto.js";
import { exportBackup, parseBackup, applyBackup, backupCategories, BACKUP_VERSION } from "../public/js/storage/backup.js";
import { createMemoryBackend, createRunStore } from "../public/js/storage/runs-store.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { createVault } from "../public/js/storage/key-vault.js";
import { createSkillsStore } from "../public/js/storage/skills-store.js";
import { createVerdictStore } from "../public/js/compare-verdict.js";
import { exportProgress, importProgress, setDone, loadProgress } from "../public/js/library-progress.js";
import { renderDataSettings, dataStats } from "../public/js/data-settings.js";
import { createBackupService } from "../public/js/data-backup.js";
import { buildRunRecord } from "../public/js/engine/run-record.js";
import { LIMIT_DEFAULTS } from "../public/js/engine/catalog.js";

const en = JSON.parse(readFileSync(new URL("../public/locales/en.json", import.meta.url), "utf8"));
const t = (k, p) => String(en[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => p?.[n] ?? `{${n}}`);
const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
};
const design = { pattern: "sequential", nodes: [{ id: "planner", agent: "planner", model: "fast", search: false }, { id: "writer", agent: "writer", model: "fast", search: false }], edges: [{ from: "planner", to: "writer" }] };
const makeRun = (id) =>
  buildRunRecord({
    id,
    design,
    task: "A task",
    events: [
      { t: 0, type: "run_start", task: "A task", pattern: "sequential", design },
      { t: 1, type: "agent_start", agent: "planner", role: "Planner" },
      { t: 2, type: "agent_output", agent: "planner", text: "ok", tokens: { input: 5, output: 5 } },
      { t: 3, type: "done", outcome: "finished", usage: { input: 5, output: 5, searches: 0, steps: 1 }, finalText: "ok" },
    ],
    limits: LIMIT_DEFAULTS,
    language: "en",
    appVersion: "1.0.0",
  });

// A set of stores like the ones of a browser.
function world() {
  const storage = memory();
  const runStore = createRunStore(createMemoryBackend());
  const settings = createSettingsStore(storage);
  const vault = createVault({ storage, iterations: 1000 });
  const skills = createSkillsStore(storage);
  const verdictStore = createVerdictStore(storage);
  const vaultOf = (id) => vault.forProvider(id);
  return { storage, runStore, settings, vault, vaultOf, skills, verdictStore };
}

test("a file is encrypted with a password and read back, and a wrong password or a changed file is refused", async () => {
  const text = JSON.stringify({ hello: "world" });
  const sealed = await encryptText(text, "pass phrase", { iterations: 1000 });
  assert.equal(isEncryptedText(sealed), true);
  assert.equal(isEncryptedText(text), false);
  assert.ok(!sealed.includes("world"));
  assert.equal(await decryptText(sealed, "pass phrase"), text);
  await assert.rejects(() => decryptText(sealed, "other"), (e) => e instanceof FileCryptoError && e.code === "wrong");
  const data = JSON.parse(sealed);
  data.ciphertext = data.ciphertext.slice(0, -4) + "AAAA";
  await assert.rejects(() => decryptText(JSON.stringify(data), "pass phrase"), (e) => e.code === "wrong");
  await assert.rejects(() => decryptText("not json", "x"), (e) => e.code === "shape");
  await assert.rejects(() => encryptText("x", ""), (e) => e.code === "password");
});

test("an export carries only the chosen parts and says which, and a restore touches nothing else", async () => {
  const backup = exportBackup({ runs: [makeRun("local-a")], settings: { tooltips: false }, skills: { skills: [], defaults: {} }, progress: ["patterns:a"], verdicts: {}, categories: ["skills", "progress"], appVersion: "1" });
  assert.equal(backup.backupVersion, BACKUP_VERSION);
  assert.deepEqual(backup.categories, ["skills", "progress"]);
  assert.deepEqual(backup.runs, []);
  assert.deepEqual(backup.settings, {});
  assert.deepEqual(backupCategories(backup), ["skills", "progress"]);
  const w = world();
  await w.runStore.save(makeRun("local-keep"));
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true);
  await applyBackup(parsed.backup, { ...w, settingsStore: w.settings, mode: "replace", skillsStore: w.skills, progressStorage: w.storage, verdictStore: w.verdictStore });
  assert.equal((await w.runStore.list()).length, 1, "a file without runs does not clear the runs, even in Replace");
  assert.deepEqual(exportProgress(w.storage), ["patterns:a"]);
});

test("an old file of version 1 is still read, and keys are carried only when asked", () => {
  const old = { backupVersion: 1, appVersion: "0", exportedAt: "x", settings: {}, runs: [] };
  const parsed = parseBackup(JSON.stringify(old));
  assert.equal(parsed.ok, true);
  assert.deepEqual(backupCategories(parsed.backup), ["runs", "settings"]);
  const record = { v: 1, kdf: "PBKDF2-SHA256", iterations: 10, salt: "a", iv: "b", ciphertext: "c" };
  assert.equal("vault" in exportBackup({ runs: [], settings: {}, vaultRecord: record, includeKey: true, categories: ["runs"], appVersion: "1" }), false);
  assert.equal("vault" in exportBackup({ runs: [], settings: {}, vaultRecord: record, includeKey: true, categories: ["keys"], appVersion: "1" }), true);
  assert.equal(parseBackup(JSON.stringify({ ...old, categories: ["nope"] })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ ...old, backupVersion: 3 })).ok, false);
  assert.equal(parseBackup(JSON.stringify({ ...old, progress: [1] })).ok, false);
});

test("skills, progress and verdicts restore by merge (keep mine, add new) and by replace", () => {
  const w = world();
  w.skills.add({ id: "u-mine", kind: "styl", name: "Mine", text: "m" });
  w.skills.setDefaults("researcher", { role: "critic", postup: "", styles: [], params: {} });
  setDone(w.storage, "patterns", "a", true);
  w.verdictStore.set(["r1", "r2"], { pick: "r1", note: "mine" });
  const file = { skills: { skills: [{ id: "u-new", kind: "styl", name: "New", text: "n", folder: "", parent: "" }, { id: "u-mine", kind: "styl", name: "Other", text: "o", folder: "", parent: "" }], defaults: { researcher: { role: "summarizer", postup: "", styles: [], params: {} }, writer: { role: "critic", postup: "", styles: [], params: {} } } }, progress: ["patterns:b"], verdicts: { "r1,r2": { pick: "r2", note: "file" }, "r3,r4": { pick: "none", note: "" } } };

  w.skills.importData(file.skills, "merge");
  importProgress(w.storage, file.progress, "merge");
  w.verdictStore.importAll(file.verdicts, "merge");
  assert.deepEqual(w.skills.library().users().map((u) => u.id).sort(), ["u-mine", "u-new"]);
  assert.equal(w.skills.library().get("u-mine").name, "Mine", "a skill that is here is kept");
  assert.equal(w.skills.defaults().researcher.role, "critic", "a default that is here is kept");
  assert.equal(w.skills.defaults().writer.role, "critic", "a default of a type without one is added");
  assert.deepEqual([...loadProgress(w.storage)].sort(), ["patterns:a", "patterns:b"]);
  assert.equal(w.verdictStore.get(["r1", "r2"]).note, "mine");
  assert.ok(w.verdictStore.get(["r3", "r4"]));

  w.skills.importData(file.skills, "replace");
  importProgress(w.storage, file.progress, "replace");
  w.verdictStore.importAll(file.verdicts, "replace");
  assert.equal(w.skills.library().get("u-mine").name, "Other");
  assert.equal(w.skills.defaults().researcher.role, "summarizer");
  assert.deepEqual([...loadProgress(w.storage)], ["patterns:b"]);
  assert.equal(w.verdictStore.get(["r1", "r2"]).note, "file");
});

test("the stores can be emptied", () => {
  const w = world();
  w.skills.add({ id: "u-a", kind: "styl", name: "A", text: "a" });
  w.verdictStore.set(["r1", "r2"], { pick: "none" });
  w.verdictStore.clearAll();
  w.skills.clearAll();
  assert.equal(w.skills.library().users().length, 0);
  assert.equal(w.verdictStore.exportAll()["r1,r2"], undefined);
});

test("the overview counts every part", async () => {
  const w = world();
  await w.runStore.save(makeRun("local-a"));
  w.skills.add({ id: "u-a", kind: "styl", name: "A", text: "a" });
  setDone(w.storage, "patterns", "a", true);
  w.verdictStore.set(["r1", "r2"], { pick: "none" });
  const stats = await dataStats(w);
  assert.deepEqual(stats.counts, { runs: 1, settings: 1, skills: 1, progress: 1, verdicts: 1, keys: 0 });
  assert.ok(stats.total > 0);
});

// ---- the screen, with a small fake DOM
class El {
  constructor(tag) { this.tag = tag; this.attrs = {}; this.children = []; this.listeners = {}; this.value = ""; this.checked = false; this.files = null; this.hidden = false; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === "checked") this.checked = true; if (k === "value") this.value = v; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...n) { this.children.push(...n); }
  replaceChildren(...n) { this.children = n; }
  remove() {}
  click() { return this.fire("click"); }
  find(pred, out = []) { for (const c of this.children) if (c instanceof El) { if (pred(c)) out.push(c); c.find(pred, out); } return out; }
  get text() { return this.children.map((c) => c.text).join(" "); }
  async fire(type) { for (const fn of this.listeners[type] ?? []) await fn(); }
}
const ui = (root, name) => root.find((e) => e.attrs["data-ui"] === name)[0];
const later = () => new Promise((r) => setTimeout(r, 20));

function screen(w, extra = {}) {
  const downloads = [];
  const said = [];
  const doc = { createElement: (tag) => new El(tag), createTextNode: (text) => ({ text }), documentElement: { lang: "en" }, body: { append: (n) => downloads.push(n) } };
  const root = renderDataSettings({ doc, t, say: (m, e) => said.push([m, e === true]), ...w, version: "1.0.0", ...extra });
  return { root, downloads, said, doc };
}

test("the screen shows the overview and two sub-tabs, and Export needs a password when keys are chosen", async () => {
  const w = world();
  const s = screen(w);
  await later();
  assert.ok(ui(s.root, "data-size"), "the total size is always shown");
  assert.equal(ui(s.root, "data-count-runs"), undefined, "the tiles are on the Statistics tab only");
  assert.ok(ui(s.root, "data-tab-export") && ui(s.root, "data-tab-clean") && ui(s.root, "data-tab-stats"));
  await ui(s.root, "data-tab-stats").click();
  await later();
  assert.equal(ui(s.root, "data-count-runs").text.trim().startsWith("0"), true);
  assert.ok(ui(s.root, "data-count-runs").attrs.title.length > 0, "a tile explains itself on hover");
  assert.equal(ui(s.root, "data-count-settings"), undefined, "settings are one record and are not counted");
  assert.ok(ui(s.root, "data-last"));
  await ui(s.root, "data-tab-export").click();
  await later();
  const keys = ui(s.root, "data-cat-keys");
  assert.equal(keys.checked, false, "keys are off by default");
  keys.checked = true;
  await keys.fire("change");
  assert.ok(ui(s.root, "data-keys-warning"));
  await ui(s.root, "data-export").click();
  assert.ok(ui(s.root, "data-keys-need-pass"));
  assert.equal(s.downloads.length, 0);
});

test("exporting with a password makes an encrypted file that the screen reads back", async () => {
  const w = world();
  await w.runStore.save(makeRun("local-a"));
  w.skills.add({ id: "u-a", kind: "styl", name: "A", text: "a" });
  const s = screen(w);
  await later();
  ui(s.root, "data-pass").value = "secret words";
  await ui(s.root, "data-export").click();
  assert.equal(s.downloads.length, 1);
  const text = await resolveObjectURL(s.downloads[0].attrs.href).text();
  assert.equal(isEncryptedText(text), true);
  assert.ok(!text.includes("local-a"));

  // another browser: nothing here yet
  const other = world();
  const s2 = screen(other);
  await later();
  const file = ui(s2.root, "data-import-file");
  file.files = [{ text: async () => text }];
  await file.fire("change");
  assert.ok(ui(s2.root, "data-import-need-pass"));
  ui(s2.root, "data-import-pass").value = "wrong";
  await ui(s2.root, "data-import-pass").fire("change");
  assert.ok(ui(s2.root, "data-import-wrong"));
  ui(s2.root, "data-import-pass").value = "secret words";
  await ui(s2.root, "data-import-pass").fire("change");
  assert.ok(ui(s2.root, "data-restore-table"));
  await ui(s2.root, "data-restore").click();
  assert.equal((await other.runStore.list()).length, 1);
  assert.equal(other.skills.library().users().length, 1);
  assert.match(s2.said.at(-1)[0], /Restored/);
});

test("a part that is unticked in the restore table is left alone", async () => {
  const w = world();
  await w.runStore.save(makeRun("local-a"));
  w.skills.add({ id: "u-a", kind: "styl", name: "A", text: "a" });
  const s = screen(w);
  await later();
  await ui(s.root, "data-export").click();
  const blob = resolveObjectURL(s.downloads[0].attrs.href);
  assert.ok(s.downloads[0].attrs.download.endsWith(".json.gz"), "a file without a password is gzip compressed");
  assert.equal(isGzip(new Uint8Array(await blob.arrayBuffer())), true);
  const other = world();
  const s2 = screen(other);
  await later();
  const file = ui(s2.root, "data-import-file");
  file.files = [blob];
  await file.fire("change");
  const runsBox = ui(s2.root, "data-restore-runs");
  runsBox.checked = false;
  await runsBox.fire("change");
  await ui(s2.root, "data-restore").click();
  assert.equal((await other.runStore.list()).length, 0);
  assert.equal(other.skills.library().users().length, 1);
});

test("a file that is not a backup is refused with the reasons", async () => {
  const s = screen(world());
  await later();
  const file = ui(s.root, "data-import-file");
  file.files = [{ text: async () => "{\"nothing\": 1}" }];
  await file.fire("change");
  assert.ok(ui(s.root, "data-import-problem"));
});

test("cleanup asks twice, then deletes only that part, and Delete all clears every part", async () => {
  const w = world();
  await w.runStore.save(makeRun("local-a"));
  w.skills.add({ id: "u-a", kind: "styl", name: "A", text: "a" });
  setDone(w.storage, "patterns", "a", true);
  const s = screen(w);
  await later();
  await ui(s.root, "data-tab-clean").click();
  await ui(s.root, "data-delete-skills").click();
  assert.equal(w.skills.library().users().length, 1, "one click only arms the button");
  assert.match(ui(s.root, "data-delete-skills").text, /Really delete/);
  await ui(s.root, "data-delete-skills").click();
  assert.equal(w.skills.library().users().length, 0);
  assert.equal((await w.runStore.list()).length, 1, "the runs are still there");
  await ui(s.root, "data-delete-all").click();
  await ui(s.root, "data-delete-all").click();
  assert.equal((await w.runStore.list()).length, 0);
  assert.equal(exportProgress(w.storage).length, 0);
});

test("a text is compressed with gzip and read back, in a file and inside an encrypted one", async () => {
  const text = JSON.stringify({ runs: Array.from({ length: 200 }, (_, i) => ({ id: "run-" + i, text: "the same words again and again" })) });
  const packed = await gzip(text);
  assert.equal(isGzip(packed), true);
  assert.ok(packed.length < text.length / 5, "repeated text shrinks a lot");
  assert.equal(await gunzip(packed), text);
  assert.equal(await fileToText({ arrayBuffer: async () => packed.buffer.slice(packed.byteOffset, packed.byteOffset + packed.byteLength) }), text);
  assert.equal(await fileToText({ arrayBuffer: async () => new TextEncoder().encode(text).buffer }), text, "a plain text file is read as it is");
  assert.equal(await fileToText({ text: async () => "plain" }), "plain");
  const sealed = await encryptText(text, "pass phrase", { iterations: 1000, compress: true });
  assert.equal(JSON.parse(sealed).compression, "gzip");
  assert.ok(sealed.length < text.length, "the encrypted file is smaller than the text");
  assert.equal(await decryptText(sealed, "pass phrase"), text);
  assert.equal(JSON.parse(await encryptText(text, "pass phrase", { iterations: 1000 })).compression, undefined, "an old style file has no compression field");
  await assert.rejects(() => decryptText(JSON.stringify({ ...JSON.parse(sealed), compression: "zip" }), "pass phrase"), (e) => e.code === "shape");
});

test("the Backup tab is off by default, and its settings have three tabs: General, When to back up, Where to back up", async () => {
  globalThis.showDirectoryPicker = () => {};
  const w = world();
  const s = screen(w);
  await later();
  await ui(s.root, "data-tab-backup").click();
  await later();
  assert.match(ui(s.root, "data-lastinfo").text, /no backup yet/);
  assert.ok(ui(s.root, "data-files-problem"), "the Backups tab says to choose a folder first");
  assert.notEqual(ui(s.root, "data-backup-now").attrs.disabled, undefined, "nothing to back up to yet");
  await ui(s.root, "data-btab-set").click();
  assert.ok(ui(s.root, "data-stab-general") && ui(s.root, "data-stab-when") && ui(s.root, "data-stab-where"));
  assert.equal(ui(s.root, "data-mode-off").checked, true);
  assert.equal(ui(s.root, "data-trigger"), undefined, "no options while it is off");
  const auto = ui(s.root, "data-mode-auto");
  auto.checked = true;
  await auto.fire("change");
  assert.ok(ui(s.root, "data-trigger"));
  assert.ok(ui(s.root, "data-interval"), "by time shows the interval");
  const trigger = ui(s.root, "data-trigger");
  trigger.value = "change";
  await trigger.fire("change");
  assert.ok(ui(s.root, "data-quiet") && ui(s.root, "data-gap"));
  assert.equal(ui(s.root, "data-interval"), undefined);
  await ui(s.root, "data-stab-where").click();
  assert.ok(ui(s.root, "data-folder-choose"));
  assert.ok(ui(s.root, "data-need-target"), "no folder chosen yet");
  await ui(s.root, "data-stab-general").click();
  assert.ok(ui(s.root, "data-pass-auto"));
  const keys = ui(s.root, "data-auto-keys");
  assert.equal(keys.checked, true, "keys are included by default");
  assert.ok(ui(s.root, "data-auto-keys-warning"));
  keys.checked = false;
  await keys.fire("change");
  assert.equal(ui(s.root, "data-auto-keys-warning"), undefined);
  delete globalThis.showDirectoryPicker;
});

test("a browser that cannot write to a folder has no automatic mode, no folder and no General tab, only the reminder", async () => {
  delete globalThis.showDirectoryPicker;
  const w = world();
  w.storage.setItem("aa.data.backup", JSON.stringify({ mode: "auto" }));
  const s = screen(w);
  await later();
  await ui(s.root, "data-tab-backup").click();
  assert.ok(ui(s.root, "data-folder-unsupported"), "the Backups tab explains it");
  assert.equal(ui(s.root, "data-backup-now"), undefined);
  await ui(s.root, "data-btab-set").click();
  assert.equal(ui(s.root, "data-stab-general"), undefined);
  assert.notEqual(ui(s.root, "data-mode-auto").attrs.disabled, undefined, "the automatic mode is switched off");
  assert.equal(ui(s.root, "data-mode-remind").checked, true, "a stored automatic mode falls back to the reminder");
  await ui(s.root, "data-stab-where").click();
  assert.ok(ui(s.root, "data-folder-unsupported"));
  assert.equal(ui(s.root, "data-folder-choose"), undefined);
});

test("the reminder shows above the tabs after enough changes and goes to Export", async () => {
  const w = world();
  const s = screen(w);
  await later();
  await ui(s.root, "data-tab-backup").click();
  await ui(s.root, "data-btab-set").click();
  const remind = ui(s.root, "data-mode-remind");
  remind.checked = true;
  await remind.fire("change");
  assert.ok(ui(s.root, "data-remindAfter"));
  assert.equal(ui(s.root, "data-remind"), undefined);
  const raw = JSON.parse(w.storage.getItem("aa.data.backup"));
  w.storage.setItem("aa.data.backup", JSON.stringify({ ...raw, changes: 9 }));
  const again = screen(w);
  await later();
  assert.ok(ui(again.root, "data-remind"));
  await ui(again.root, "data-remind-go").click();
  assert.ok(ui(again.root, "data-export"), "the button opens Export and import");
});

test("the Backups tab lists the files of the folder, and a file is deleted after a second click", async () => {
  globalThis.showDirectoryPicker = () => {};
  const files = new Map([["agent-atlas-backup-2026-11-25-1300.json.gz", "aaa"], ["agent-atlas-backup-2026-11-25-1400.json", "bbbb"], ["holiday.json", "x"]]);
  const folder = {
    name: "Backups",
    queryPermission: async () => "granted",
    requestPermission: async () => "granted",
    removeEntry: async (n) => void files.delete(n),
    async *entries() {
      for (const n of files.keys()) yield [n, { kind: "file", getFile: async () => ({ size: files.get(n).length, lastModified: 1 }) }];
    },
  };
  const w = world();
  w.storage.setItem("aa.data.backup", JSON.stringify({ lastBackup: Date.UTC(2026, 10, 25, 14, 0) }));
  const s = screen(w, { backup: createBackupService({ ...w, getVersion: () => "1", folderStore: { supported: () => true, get: async () => folder, set: async () => {}, clear: async () => {} } }) });
  await later();
  await ui(s.root, "data-tab-backup").click();
  await later();
  assert.ok(ui(s.root, "data-files-table"));
  assert.ok(ui(s.root, "data-file-lock-agent-atlas-backup-2026-11-25-1400.json"), "an encrypted file has the lock icon");
  assert.equal(ui(s.root, "data-file-lock-agent-atlas-backup-2026-11-25-1300.json.gz"), undefined, "a file without a password has none");
  assert.equal(ui(s.root, "data-file-holiday.json"), undefined, "a file of another name is not listed");
  const del = () => ui(s.root, "data-file-delete-agent-atlas-backup-2026-11-25-1300.json.gz");
  await del().click();
  assert.equal(files.has("agent-atlas-backup-2026-11-25-1300.json.gz"), true, "one click only arms the button");
  await later();
  await del().click();
  await later();
  assert.equal(files.has("agent-atlas-backup-2026-11-25-1300.json.gz"), false);
  assert.equal(files.has("holiday.json"), true);
  delete globalThis.showDirectoryPicker;
});
