// Export and import of everything the app remembers. Run text is data and is never interpreted.
// A plaintext key is never part of a backup; the key may travel only as its encrypted vault record.
import { validateRun } from "../run-schema.js";

export const BACKUP_VERSION = 1;
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

export function exportBackup({ runs, settings, vaultRecord = null, includeKey = false, appVersion }) {
  const backup = { backupVersion: BACKUP_VERSION, appVersion, exportedAt: new Date().toISOString(), settings: settings ?? {}, runs };
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
  if (data.backupVersion !== BACKUP_VERSION) return { ok: false, errors: [`Unsupported backup version: ${String(data.backupVersion)}.`] };
  if (!Array.isArray(data.runs)) return { ok: false, errors: ["The backup has no list of runs."] };
  if (data.settings !== undefined && !isObject(data.settings)) return { ok: false, errors: ["The settings in the backup are not valid."] };
  if (data.vault !== undefined && !isVaultRecord(data.vault)) return { ok: false, errors: ["The saved key in the backup is not valid."] };

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

export async function applyBackup(backup, { runStore, settingsStore, vault, mode }) {
  if (mode === "replace") await runStore.clear();
  let added = 0;
  let skipped = 0;
  let failed = 0;
  for (const run of backup.runs) {
    if (mode !== "replace" && (await runStore.get(run.id))) {
      skipped += 1;
      continue;
    }
    const result = await runStore.save(run);
    if (result.ok) added += 1;
    else failed += 1;
  }
  if (isObject(backup.settings?.limits)) settingsStore.setLimits(backup.settings.limits);
  if (typeof backup.settings?.tooltips === "boolean") settingsStore.setTooltips(backup.settings.tooltips);
  if (backup.settings?.playerLayout === "bar" || backup.settings?.playerLayout === "side") settingsStore.setPlayerLayout(backup.settings.playerLayout);
  if (typeof backup.settings?.shortcuts === "boolean") settingsStore.setShortcuts(backup.settings.shortcuts);
  if (backup.vault && (mode === "replace" || !vault.hasStoredKey())) vault.importRecord(backup.vault);
  return { added, skipped, failed };
}
