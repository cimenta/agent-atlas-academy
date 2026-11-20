// A bundle of runs in one JSON file, and the plan for importing files of runs.
import { runForExport } from "./run-export.js";
import { validateRun } from "./run-schema.js";

export const BUNDLE_FORMAT = "agent-atlas-run-bundle";

// The runs as they leave the browser: each one cleaned the way a single export is.
export function makeBundle(runs) {
  return { format: BUNDLE_FORMAT, version: 1, runs: runs.map((run) => runForExport(run)) };
}

// The text of a chosen file: a bundle, or one plain run (a bundle of one). The runs are not checked here, planImport checks each.
export function readImportText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "json" };
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) return { ok: false, reason: "invalid" };
  if (data.format === BUNDLE_FORMAT) {
    return Array.isArray(data.runs) && data.runs.length > 0 ? { ok: true, bundle: true, runs: data.runs } : { ok: false, reason: "empty" };
  }
  return data.design !== null && typeof data.design === "object" ? { ok: true, bundle: false, runs: [data] } : { ok: false, reason: "invalid" };
}

// What the content of a run is, apart from its id: two runs with the same content are the same run.
const contentOf = (run) => {
  // The log of the calls is not part of the content: the store may trim it when it saves, and the same run must still be the same run.
  const { id, apiCalls, apiCallsDropped, ...rest } = runForExport(run);
  return JSON.stringify(rest);
};

// One entry per candidate: added (new id), skipped (same id and same content), copy (same id, other content: a new id) or refused.
// Runs added earlier in the same call count as existing, so one file cannot add the same run twice.
// reserved: ids that belong to something else (the library runs). An id the router cannot open, or a reserved one, is taken like a used id.
export function planImport(candidates, existing, makeId, reserved = new Set()) {
  const known = new Map((existing ?? []).map((run) => [run.id, contentOf(run)]));
  const contents = new Set(known.values());
  return candidates.map((candidate) => {
    const title = typeof candidate?.title === "string" ? candidate.title : "";
    const id = typeof candidate?.id === "string" ? candidate.id : "";
    const check = validateRun(candidate);
    if (!check.ok) return { id, title, status: "refused", reason: check.errors?.[0] ?? "invalid" };
    const content = contentOf(candidate);
    // The same content under any id is a run that is already there (a copy made by an earlier import).
    if (contents.has(content)) return { id, title, status: "skipped" };
    if (!known.has(candidate.id) && !reserved.has(candidate.id) && /^[a-z0-9-]+$/.test(candidate.id)) {
      known.set(candidate.id, content);
      contents.add(content);
      return { id, title, status: "added", run: candidate };
    }
    const copy = { ...candidate, id: makeId() };
    known.set(copy.id, content);
    contents.add(content);
    return { id, title, status: "copy", run: copy };
  });
}
