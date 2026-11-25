import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolveObjectURL } from "node:buffer";
import { encryptText, decryptText, isEncryptedText, FileCryptoError } from "../public/js/storage/file-crypto.js";
import { exportBackup, parseBackup, applyBackup, backupCategories, BACKUP_VERSION } from "../public/js/storage/backup.js";
import { createMemoryBackend, createRunStore } from "../public/js/storage/runs-store.js";
import { createSettingsStore } from "../public/js/storage/settings.js";
import { createVault } from "../public/js/storage/key-vault.js";
import { createSkillsStore } from "../public/js/storage/skills-store.js";
import { createVerdictStore } from "../public/js/compare-verdict.js";
import { exportProgress, importProgress, setDone, loadProgress } from "../public/js/library-progress.js";
import { renderDataSettings, dataStats } from "../public/js/data-settings.js";
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
  const text = await resolveObjectURL(s.downloads[0].attrs.href).text();
  const other = world();
  const s2 = screen(other);
  await later();
  const file = ui(s2.root, "data-import-file");
  file.files = [{ text: async () => text }];
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
