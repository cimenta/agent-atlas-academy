// The backup of the Data screen: an export that runs by itself. This file holds the settings of it, the rules of when a backup is due
// (pure functions, tested), and a service that watches the data while the app is open, builds the file and writes it to a folder.
// Nothing here talks to a server; the file goes to a folder of the student's own computer (which a cloud app may sync).
import { SLOT_IDS } from "./key-slots.js";
import { exportBackup, backupVaultRecords, BACKUP_CATEGORIES } from "./storage/backup.js";
import { encryptText, gzip } from "./storage/file-crypto.js";
import { exportProgress } from "./library-progress.js";

export const BACKUP_KEY = "aa.data.backup";
export const OPTIONS = { remindAfter: [3, 5, 10], interval: [15, 60, 360, 1440], quiet: [1, 2, 5], gap: [10, 30, 60] };
export const MODES = ["off", "remind", "auto"];
export const TRIGGERS = ["time", "change"];
export const KEEP_FILES = 5;
export const FILE_PREFIX = "agent-atlas-backup-";
// A backup is gzip compressed: a file .json.gz without a password, and a .json wrapper with the compressed text inside when there is one.
export const PLAIN_EXTENSION = ".json.gz";
export const ENCRYPTED_EXTENSION = ".json";
const MINUTE = 60000;

export const DEFAULTS = { mode: "off", remindAfter: 5, trigger: "time", interval: 60, quiet: 2, gap: 10, autoKeys: true, lastBackup: 0, lastChange: 0, failedAt: 0, changes: 0, sig: "" };

const pick = (value, list, fallback) => (list.includes(value) ? value : fallback);
const time = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

// Whatever is stored becomes a valid state: unknown values fall back to the defaults.
export function normalize(raw) {
  const r = raw !== null && typeof raw === "object" ? raw : {};
  return {
    mode: pick(r.mode, MODES, DEFAULTS.mode),
    remindAfter: pick(r.remindAfter, OPTIONS.remindAfter, DEFAULTS.remindAfter),
    trigger: pick(r.trigger, TRIGGERS, DEFAULTS.trigger),
    interval: pick(r.interval, OPTIONS.interval, DEFAULTS.interval),
    quiet: pick(r.quiet, OPTIONS.quiet, DEFAULTS.quiet),
    gap: pick(r.gap, OPTIONS.gap, DEFAULTS.gap),
    autoKeys: typeof r.autoKeys === "boolean" ? r.autoKeys : DEFAULTS.autoKeys,
    lastBackup: time(r.lastBackup),
    lastChange: time(r.lastChange),
    failedAt: time(r.failedAt),
    changes: Number.isInteger(r.changes) && r.changes > 0 ? r.changes : 0,
    sig: typeof r.sig === "string" ? r.sig : "",
  };
}

export function readState(storage) {
  try {
    return normalize(JSON.parse(storage?.getItem(BACKUP_KEY) ?? "null"));
  } catch {
    return normalize(null);
  }
}
export function writeState(storage, state) {
  try {
    storage?.setItem(BACKUP_KEY, JSON.stringify(state));
  } catch {
    // the state is just not remembered
  }
}

// A short fingerprint of a text (not a security feature, only to see that something changed).
export function fingerprint(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return `${text.length}:${(h >>> 0).toString(36)}`;
}

// The data was seen again: when its fingerprint differs from the last one, that is one more change.
// The first sight of the data only remembers the fingerprint, it is not a change.
export function observe(state, sig, now) {
  if (sig === state.sig) return state;
  if (state.sig === "") return { ...state, sig };
  return { ...state, sig, changes: state.changes + 1, lastChange: now };
}

// Is a backup due now? Only in the mode auto, and only when something changed since the last one.
//   by time: the interval since the last backup has passed.
//   after a change: the data was quiet for the quiet time, and at least the gap has passed since the last backup.
export function backupDue(state, now) {
  if (state.mode !== "auto" || state.changes === 0) return false;
  if (state.trigger === "time") return state.lastBackup === 0 || now - state.lastBackup >= state.interval * MINUTE;
  return now - state.lastChange >= state.quiet * MINUTE && (state.lastBackup === 0 || now - state.lastBackup >= state.gap * MINUTE);
}

// The reminder of the mode remind: shown when enough changes were made since the last backup or export.
export const reminderDue = (state) => state.mode === "remind" && state.changes >= state.remindAfter;

// The file name of a backup, sortable: agent-atlas-backup-2026-11-25-1432.json.gz
export function backupFileName(date, extension = PLAIN_EXTENSION) {
  const p = (n) => String(n).padStart(2, "0");
  return `${FILE_PREFIX}${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${extension}`;
}

// Is this a file of ours? (agent-atlas-backup-...json or .json.gz) A file of another name in the folder is never listed, changed or removed.
export const isBackupFile = (name) => name.startsWith(FILE_PREFIX) && (name.endsWith(".json") || name.endsWith(".json.gz"));

// The time in the name of a backup file (agent-atlas-backup-2026-11-25-1432.json.gz) as milliseconds, or 0 when the name has none.
export function dateOfName(name) {
  const m = /^agent-atlas-backup-(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})\.json(?:\.gz)?$/.exec(name);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])).getTime() : 0;
}

// Writes the file into a folder handle (File System Access API) and removes the oldest of our own files beyond the newest KEEP_FILES.
export async function writeToFolder(handle, name, data, keep = KEEP_FILES) {
  const file = await handle.getFileHandle(name, { create: true });
  const out = await file.createWritable();
  await out.write(data);
  await out.close();
  const ours = [];
  for await (const [entryName, entry] of handle.entries()) if (entry.kind === "file" && isBackupFile(entryName)) ours.push(entryName);
  ours.sort();
  for (const old of ours.slice(0, Math.max(0, ours.length - keep))) {
    try {
      await handle.removeEntry(old);
    } catch {
      // an old file that cannot be removed is left
    }
  }
}

// The folder handle must outlive a page load, so it is kept in the IndexedDB of the browser (handles can be stored there, not in localStorage).
export function createFolderStore(factory = globalThis.indexedDB) {
  const open = () =>
    new Promise((resolve, reject) => {
      const request = factory.open("aa-backup", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("handles");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const run = async (mode, make) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("handles", mode);
      const request = make(tx.objectStore("handles"));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
    });
  };
  return {
    supported: () => typeof globalThis.showDirectoryPicker === "function" && Boolean(factory),
    get: async () => (factory ? ((await run("readonly", (s) => s.get("folder"))) ?? null) : null),
    set: (handle) => run("readwrite", (s) => s.put(handle, "folder")),
    clear: () => run("readwrite", (s) => s.delete("folder")),
  };
}

export function createBackupService({ storage, runStore, settings, skills, vault, vaultOf, verdictStore, getVersion = () => "", folderStore, now = () => Date.now(), onChange = () => {} }) {
  let state = readState(storage);
  let password = ""; // kept in memory only
  let busy = false;
  let error = "";
  let timer = null;
  let folderName = "";

  const save = (next) => {
    state = next;
    writeState(storage, state);
    onChange();
  };

  // A backup file of the chosen parts: { data, extension, mime }. Always gzip compressed, and encrypted when there is a password. Also used by the manual export.
  async function buildFile(chosen, pass) {
    const items = chosen.includes("runs") ? await runStore.list() : [];
    const runs = [];
    for (const item of items) runs.push(await runStore.get(item.id));
    const backup = exportBackup({
      runs: runs.filter(Boolean),
      settings: settings.get(),
      skills: skills ? skills.exportData() : null,
      progress: exportProgress(storage),
      verdicts: verdictStore.exportAll(),
      categories: chosen,
      vaultRecord: vault.exportRecord(),
      ...backupVaultRecords(vaultOf),
      includeKey: chosen.includes("keys"),
      appVersion: getVersion(),
    });
    const plain = JSON.stringify(backup, null, 2);
    if (pass === "") return { data: await gzip(plain), extension: PLAIN_EXTENSION, mime: "application/gzip" };
    return { data: await encryptText(plain, pass, { compress: true }), extension: ENCRYPTED_EXTENSION, mime: "application/json" };
  }

  // The fingerprint of everything a backup would hold (the runs by their ids: a run is saved once and not edited).
  async function snapshot() {
    const runs = (await runStore.list()).map((r) => r.id).join(",");
    const keys = SLOT_IDS.filter((id) => vaultOf(id).hasStoredKey()).join(",");
    return fingerprint(JSON.stringify([runs, settings.get(), skills ? skills.exportData() : null, exportProgress(storage), verdictStore.exportAll(), keys]));
  }

  const categories = () => BACKUP_CATEGORIES.filter((c) => c !== "keys" || state.autoKeys);

  async function permission(handle, ask) {
    const mode = { mode: "readwrite" };
    if ((await handle.queryPermission?.(mode)) === "granted") return true;
    return ask ? (await handle.requestPermission?.(mode)) === "granted" : false;
  }

  // Writes one backup to the folder. `interactive` is true when the student pressed the button, so the browser may ask for permission.
  async function backupNow({ interactive = false } = {}) {
    if (busy) return { ok: false, reason: "busy" };
    const handle = await folderStore.get();
    if (!handle) return { ok: false, reason: "no-folder" };
    busy = true;
    try {
      if (!(await permission(handle, interactive))) {
        error = "permission";
        save({ ...state, failedAt: now() });
        return { ok: false, reason: "permission" };
      }
      const file = await buildFile(categories(), password);
      await writeToFolder(handle, backupFileName(new Date(now()), file.extension), file.data);
      error = "";
      save({ ...state, lastBackup: now(), failedAt: 0, changes: 0, sig: await snapshot() });
      return { ok: true };
    } catch {
      error = "write";
      save({ ...state, failedAt: now() });
      return { ok: false, reason: "write" };
    } finally {
      busy = false;
    }
  }

  // One look at the data: count a change, show a reminder, make a backup when it is due. Called every half minute while the app is open.
  async function tick() {
    try {
      const next = observe(state, await snapshot(), now());
      if (next !== state) save(next);
      if (backupDue(state, now()) && (await folderStore.get())) await backupNow();
    } catch {
      // the next look tries again
    }
  }

  // The backup files that are in the folder now, the newest first: { ok, reason, files: [{ name, size, date, encrypted }] }.
  // It only reads (no permission is asked): when the browser has not given the permission, the reason is permission.
  async function listFiles() {
    const handle = await folderStore.get();
    if (!handle) return { ok: false, reason: "no-folder", files: [] };
    try {
      if (!(await permission(handle, false))) return { ok: false, reason: "permission", files: [] };
      const files = [];
      for await (const [name, entry] of handle.entries()) {
        if (entry.kind !== "file" || !isBackupFile(name)) continue;
        const file = await entry.getFile();
        files.push({ name, size: file.size, date: dateOfName(name) || file.lastModified || 0, encrypted: !name.endsWith(".gz") });
      }
      files.sort((a, b) => (a.name < b.name ? 1 : a.name > b.name ? -1 : 0));
      return { ok: true, files };
    } catch {
      return { ok: false, reason: "read", files: [] };
    }
  }

  // Removes one backup file of ours from the folder (never a file of another name).
  async function deleteFile(name) {
    if (!isBackupFile(name)) return false;
    const handle = await folderStore.get();
    if (!handle || !(await permission(handle, true))) return false;
    try {
      await handle.removeEntry(name);
      return true;
    } catch {
      return false;
    }
  }

  return {
    listFiles,
    deleteFile,
    state: () => state,
    update(patch) {
      save(normalize({ ...state, ...patch }));
    },
    setPassword(value) {
      password = String(value ?? "");
    },
    hasPassword: () => password !== "",
    buildFile,
    backupNow,
    tick,
    error: () => error,
    folderName: () => folderName,
    async loadFolder() {
      const handle = folderStore.supported() ? await folderStore.get().catch(() => null) : null;
      folderName = handle?.name ?? "";
      return handle;
    },
    async chooseFolder() {
      const handle = await globalThis.showDirectoryPicker({ mode: "readwrite" });
      await folderStore.set(handle);
      folderName = handle.name ?? "";
      error = "";
      onChange();
      return handle;
    },
    async clearFolder() {
      await folderStore.clear();
      folderName = "";
      onChange();
    },
    // The student made an export by hand: the changes up to now are saved, so the reminder starts again.
    markExported() {
      save({ ...state, changes: 0 });
    },
    start(every = 30000) {
      if (timer !== null) return;
      timer = setInterval(tick, every);
      tick();
    },
    stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
    },
  };
}
