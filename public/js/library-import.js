// Import of run files into the browser: each file is a bundle or one plain run. Never half-saved: every run is checked first, a run that
// cannot be saved is reported as refused and the runs saved before it stay.
import { planImport, readImportText } from "./run-bundle.js";

// files: [{ name, text }]. Returns { rows: [{ file, id, title, status, reason? }], counts: { added, skipped, copy, refused } }.
export async function importFiles(files, { runStore, makeId, reservedIds = new Set() }) {
  const existing = [];
  // When the store cannot be read, nothing can be checked or saved: every run is reported as refused (storage).
  let storageDown = false;
  try {
    for (const item of await runStore.list()) {
      const run = await runStore.get(item.id);
      if (run) existing.push(run);
    }
  } catch {
    storageDown = true;
  }
  const rows = [];
  for (const file of files) {
    const read = readImportText(file.text);
    if (!read.ok) {
      rows.push({ file: file.name, id: "", title: file.name, status: "refused", reason: read.reason });
      continue;
    }
    // A single plain run gets a fresh id, as it always did; the runs of a bundle keep theirs unless that id is taken.
    const candidates = read.bundle ? read.runs : [{ ...read.runs[0], id: makeId() }];
    if (storageDown) {
      for (const c of candidates) rows.push({ file: file.name, id: typeof c?.id === "string" ? c.id : "", title: typeof c?.title === "string" ? c.title : "", status: "refused", reason: "storage" });
      continue;
    }
    for (const entry of planImport(candidates, existing, makeId, reservedIds)) {
      const { run, ...row } = entry;
      if (!run) {
        rows.push({ file: file.name, ...row });
        continue;
      }
      const saved = await runStore.save(run);
      if (saved?.ok) {
        existing.push(run);
        rows.push({ file: file.name, ...row, id: run.id });
      } else {
        rows.push({ file: file.name, id: row.id, title: row.title, status: "refused", reason: saved?.reason ?? "storage" });
      }
    }
  }
  const counts = { added: 0, skipped: 0, copy: 0, refused: 0 };
  for (const row of rows) counts[row.status] += 1;
  return { rows, counts };
}
