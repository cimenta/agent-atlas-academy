// Export and import of everything the app remembers. Run text is data and is never interpreted.
// A plaintext key is never part of a backup; the key may travel only as its encrypted vault record.
import { validateRun } from "../run-schema.js";
import { SLOT_IDS } from "../key-slots.js";
import { importProgress } from "../library-progress.js";

// Version 2 adds the categories skills, progress and verdicts and the list of categories the file carries. A file of version 1 is still read (it has runs, settings and keys).
export const BACKUP_VERSION = 2;
const ACCEPTED_VERSIONS = [1, 2];
export const BACKUP_CATEGORIES = ["runs", "settings", "skills", "progress", "verdicts", "keys"];
const LEGACY_CATEGORIES = ["runs", "settings", "keys"];
const MAX_TEXT = 25 * 1024 * 1024;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function isVaultRecord(record) {
  return (
    isObject(record) &&
    record.v === 1 &&
    record.kdf === "PBKDF2-SHA256" &&
    Number.isInteger(record.iterations) &&
    record.iterations > 0 &&
    ["salt", "iv", "ciphertext"].every((f) => typeof record[f] === "string")
  );
}

const plainRecord = (r) => ({ v: r.v, kdf: r.kdf, iterations: r.iterations, salt: r.salt, iv: r.iv, ciphertext: r.ciphertext });

// The saved keys a backup may carry, as the backup file names them.
// The Anthropic and Gemini keys keep their own fields; every other slot (Groq, and the providers to come) travels in slotRecords.
const OWN_FIELDS = new Set(["anthropic", "google", "google-free"]);
export const backupVaultRecords = (vaultOf) => ({
  googleRecord: vaultOf("google").exportRecord(),
  googleFreeRecord: vaultOf("google-free").exportRecord(),
  slotRecords: Object.fromEntries(SLOT_IDS.filter((id) => !OWN_FIELDS.has(id)).map((id) => [id, vaultOf(id).exportRecord()])),
});

// categories: which parts the file carries (the list is written into it, so a restore never touches what the file does not carry).
// A part that is not chosen is left out of the file. skills: { skills, defaults }; progress: a list of keys; verdicts: an object.
export function exportBackup({ runs, settings, skills = null, progress = null, verdicts = null, categories = null, vaultRecord = null, googleRecord = null, googleFreeRecord = null, slotRecords = null, includeKey = false, appVersion }) {
  const chosen = Array.isArray(categories) ? BACKUP_CATEGORIES.filter((c) => categories.includes(c)) : null;
  const has = (c) => chosen === null || chosen.includes(c);
  const backup = { backupVersion: BACKUP_VERSION, appVersion, exportedAt: new Date().toISOString(), settings: has("settings") ? (settings ?? {}) : {}, runs: has("runs") ? runs : [] };
  if (chosen !== null) backup.categories = includeKey || !chosen.includes("keys") ? chosen : chosen.filter((c) => c !== "keys");
  if (has("skills") && isObject(skills)) backup.skills = skills;
  if (has("progress") && Array.isArray(progress)) backup.progress = progress;
  if (has("verdicts") && isObject(verdicts)) backup.verdicts = verdicts;
  if (!has("keys")) includeKey = false;
  if (includeKey && isVaultRecord(vaultRecord)) {
    backup.vault = {
      v: vaultRecord.v,
      kdf: vaultRecord.kdf,
      iterations: vaultRecord.iterations,
      salt: vaultRecord.salt,
      iv: vaultRecord.iv,
      ciphertext: vaultRecord.ciphertext,
    };
  }
  if (includeKey && isVaultRecord(googleRecord)) backup.vaultGoogle = plainRecord(googleRecord);
  if (includeKey && isVaultRecord(googleFreeRecord)) backup.vaultGoogleFree = plainRecord(googleFreeRecord);
  if (includeKey && isObject(slotRecords)) {
    const slots = Object.fromEntries(Object.entries(slotRecords).filter(([id, r]) => SLOT_IDS.includes(id) && isVaultRecord(r)).map(([id, r]) => [id, plainRecord(r)]));
    if (Object.keys(slots).length > 0) backup.vaultSlots = slots;
  }
  return backup;
}

export function parseBackup(text) {
  if (typeof text !== "string" || text.length > MAX_TEXT) return { ok: false, errors: ["The file is too large (25 MB at most)."] };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, errors: ["The file is not valid JSON."] };
  }
  if (!isObject(data)) return { ok: false, errors: ["The file is not a backup."] };
  if (!ACCEPTED_VERSIONS.includes(data.backupVersion)) return { ok: false, errors: [`Unsupported backup version: ${String(data.backupVersion)}.`] };
  if (!Array.isArray(data.runs)) return { ok: false, errors: ["The backup has no list of runs."] };
  if (data.settings !== undefined && !isObject(data.settings)) return { ok: false, errors: ["The settings in the backup are not valid."] };
  if (data.categories !== undefined && !(Array.isArray(data.categories) && data.categories.every((c) => BACKUP_CATEGORIES.includes(c)))) return { ok: false, errors: ["The list of parts in the backup is not valid."] };
  if (data.skills !== undefined && !(isObject(data.skills) && Array.isArray(data.skills.skills) && (data.skills.defaults === undefined || isObject(data.skills.defaults)))) return { ok: false, errors: ["The skills in the backup are not valid."] };
  if (data.progress !== undefined && !(Array.isArray(data.progress) && data.progress.every((x) => typeof x === "string"))) return { ok: false, errors: ["The progress in the backup is not valid."] };
  if (data.verdicts !== undefined && !isObject(data.verdicts)) return { ok: false, errors: ["The verdicts in the backup are not valid."] };
  if (data.vault !== undefined && !isVaultRecord(data.vault)) return { ok: false, errors: ["The saved key in the backup is not valid."] };

  if (data.vaultGoogle !== undefined && !isVaultRecord(data.vaultGoogle)) return { ok: false, errors: ["The saved Gemini key in the backup is not valid."] };
  if (data.vaultGoogleFree !== undefined && !isVaultRecord(data.vaultGoogleFree)) return { ok: false, errors: ["The saved free Gemini key in the backup is not valid."] };
  if (data.vaultSlots !== undefined) {
    if (!isObject(data.vaultSlots) || !Object.entries(data.vaultSlots).every(([id, record]) => !SLOT_IDS.includes(id) || isVaultRecord(record))) return { ok: false, errors: ["The saved keys of the other providers in the backup are not valid."] };
  }

  const errors = [];
  data.runs.forEach((run, index) => {
    const result = validateRun(run);
    if (!result.ok) {
      const label = isObject(run) && typeof run.id === "string" ? run.id : `#${index + 1}`;
      for (const message of result.errors) errors.push(`Run ${label}: ${message}`);
    }
  });
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, backup: data };
}

// only: the parts to restore (default: every part the file carries). skillsStore, progressStorage and verdictStore restore the other parts.
export async function applyBackup(backup, { runStore, settingsStore, vault, mode, only = null, skillsStore = null, progressStorage = null, verdictStore = null }) {
  const carried = backupCategories(backup);
  const want = (c) => carried.includes(c) && (only === null || only.includes(c));
  if (want("skills") && skillsStore) skillsStore.importData(backup.skills, mode);
  if (want("progress") && progressStorage) importProgress(progressStorage, backup.progress, mode);
  if (want("verdicts") && verdictStore) verdictStore.importAll(backup.verdicts, mode);
  if (want("runs") && mode === "replace") await runStore.clear();
  let added = 0;
  let skipped = 0;
  let failed = 0;
  for (const run of want("runs") ? backup.runs : []) {
    if (mode !== "replace" && (await runStore.get(run.id))) {
      skipped += 1;
      continue;
    }
    const result = await runStore.save(run);
    if (result.ok) added += 1;
    else failed += 1;
  }
  if (!want("settings")) backup = { ...backup, settings: {} };
  if (isObject(backup.settings?.limits)) settingsStore.setLimits(backup.settings.limits);
  if (backup.settings?.requestTimeoutSec !== undefined) settingsStore.setRequestTimeout(backup.settings.requestTimeoutSec);
  if (backup.settings?.maxOutputTokens !== undefined) settingsStore.setMaxOutputTokens(backup.settings.maxOutputTokens);
  if (backup.settings?.retries !== undefined) settingsStore.setRetries(backup.settings.retries, backup.settings.retryDelaySec);
  if (backup.settings?.repeatStop !== undefined) settingsStore.setRepeatStop(backup.settings.repeatStop);
  if (backup.settings?.handoffChars !== undefined) settingsStore.setHandoffChars(backup.settings.handoffChars);
  if (typeof backup.settings?.tooltips === "boolean") settingsStore.setTooltips(backup.settings.tooltips);
  if (backup.settings?.fallback !== undefined) settingsStore.setFallback(backup.settings.fallback);
  if (typeof backup.settings?.formatEnforcement === "boolean") settingsStore.setFormatEnforcement(backup.settings.formatEnforcement);
  if (typeof backup.settings?.webSearch === "boolean") settingsStore.setWebSearch(backup.settings.webSearch);
  if (typeof backup.settings?.ownTools === "boolean") settingsStore.setOwnTools(backup.settings.ownTools);
  if (typeof backup.settings?.helpButtons === "boolean") settingsStore.setHelpButtons(backup.settings.helpButtons);
  if (backup.settings?.playerLayout === "bar" || backup.settings?.playerLayout === "side") settingsStore.setPlayerLayout(backup.settings.playerLayout);
  if (backup.settings?.createLayout === "steps" || backup.settings?.createLayout === "workspace") settingsStore.setCreateLayout(backup.settings.createLayout);
  if (typeof backup.settings?.shortcuts === "boolean") settingsStore.setShortcuts(backup.settings.shortcuts);
  if (isObject(backup.settings?.goKeys)) settingsStore.setGoKeys(backup.settings.goKeys);
  // The ids a student chose for vanished free models: only a known slot and tier with an id of a safe shape is kept (the store checks).
  if (isObject(backup.settings?.modelOverrides)) {
    for (const [slot, tiers] of Object.entries(backup.settings.modelOverrides)) {
      if (isObject(tiers)) for (const [key, id] of Object.entries(tiers)) {
        // A merge keeps a pick that was already made here.
        if (mode !== "replace" && settingsStore.get().modelOverrides?.[slot]?.[key]) continue;
        settingsStore.setModelOverride(slot, key, id);
      }
    }
  }
  if (!want("keys")) return { added, skipped, failed };
  if (backup.vault && (mode === "replace" || !vault.hasStoredKey())) vault.importRecord(backup.vault);
  // An older backup marked its one Gemini key as free with a setting; that key goes to the free slot.
  const legacyFree = backup.settings?.freeTier?.google === true && !backup.vaultGoogleFree;
  const restore = (slot, record) => {
    const target = vault.forProvider?.(slot);
    if (target && record && (mode === "replace" || !target.hasStoredKey())) target.importRecord(record);
  };
  restore(legacyFree ? "google-free" : "google", backup.vaultGoogle);
  restore("google-free", backup.vaultGoogleFree);
  // Every other provider: a slot this version does not know is ignored.
  for (const [slot, record] of Object.entries(backup.vaultSlots ?? {})) if (SLOT_IDS.includes(slot)) restore(slot, record);
  return { added, skipped, failed };
}

// The parts a parsed backup carries: the list written into it, or (a file of version 1) runs, settings and keys.
export function backupCategories(backup) {
  const listed = Array.isArray(backup?.categories) ? backup.categories : LEGACY_CATEGORIES;
  return BACKUP_CATEGORIES.filter((c) => {
    if (!listed.includes(c)) return false;
    if (c === "keys") return !!(backup.vault || backup.vaultGoogle || backup.vaultGoogleFree || Object.keys(backup.vaultSlots ?? {}).length > 0);
    if (c === "skills") return isObject(backup.skills);
    if (c === "progress") return Array.isArray(backup.progress);
    if (c === "verdicts") return isObject(backup.verdicts);
    return true;
  });
}
