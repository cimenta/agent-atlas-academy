// Submitting a run to the library by e-mail. A mailto link cannot carry a file, so the run is saved as a file
// (the same one Export run makes) and the mail program opens with a message that asks to attach it. Nothing is sent
// by the site: the visitor reads the message and sends it from their own mail program.
import { downloadFile, safeFileName } from "./download.js";
import { runForExport } from "./run-export.js";

export const SUBMIT_EMAIL = "submit-run@agentatlas.academy";

// The mailto: link for a run whose file is called `file`.
export function submitLink(t, run, file) {
  const title = String(run?.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const subject = t("submit.subject", { title });
  const body = t("submit.body", { file }).replace(/\n/g, "\r\n");
  return `mailto:${SUBMIT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Only a finished run of the visitor's own is worth submitting.
export const canSubmit = (run) => run?.outcome === "finished" && Array.isArray(run?.events) && run.events.length > 0;

// Asks first (the run holds the whole task and every answer), then saves the file and opens the mail program.
export function submitRun(doc, t, run) {
  const file = `${safeFileName(run.id)}.json`;
  if (!doc.defaultView.confirm(t("submit.confirm", { file, mail: SUBMIT_EMAIL }))) return false;
  downloadFile(doc, file, JSON.stringify(runForExport(run), null, 2), "application/json");
  const link = doc.createElement("a");
  link.setAttribute("href", submitLink(t, run, file));
  doc.body.append(link);
  link.click();
  link.remove();
  return true;
}
