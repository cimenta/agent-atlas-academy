// Submitting a run to the library by e-mail. A mailto link cannot carry a file, so the run is saved as a file
// (the same one Export run makes) and the mail program opens, in a new tab, with a message that asks to attach it.
// Nothing is sent by the site: the visitor reads the message and sends it from their own mail program.
import { downloadFile, safeFileName } from "./download.js";
import { runForExport } from "./run-export.js";
import { h } from "./dom.js";
import { showCenterTip } from "./center-tip.js";

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

// Saves the file and opens the mail program in a new tab. It runs from a click on the button of the panel below,
// because a browser only allows a new tab from a click it has just seen, not after a long pause on a confirm box.
export function sendSubmission(doc, t, run) {
  const file = `${safeFileName(run.id)}.json`;
  downloadFile(doc, file, JSON.stringify(runForExport(run), null, 2), "application/json");
  const link = doc.createElement("a");
  link.setAttribute("href", submitLink(t, run, file));
  link.setAttribute("target", "_blank");
  link.setAttribute("rel", "noopener noreferrer");
  doc.body.append(link);
  link.click();
  link.remove();
}

// Asks first (the run holds the whole task and every answer) in a panel that stays until it is closed; its button does the sending.
export function submitRun(doc, t, run) {
  const file = `${safeFileName(run.id)}.json`;
  const paragraphs = t("submit.confirm", { file, mail: SUBMIT_EMAIL }).split(/\n\n/).map((text) => h(doc, "p", {}, text));
  const go = h(doc, "button", { type: "button", class: "primary", "data-ui": "submit-run-go" }, t("submit.go"));
  const tip = showCenterTip({ doc, content: h(doc, "div", { class: "submit-panel", "data-ui": "submit-panel" }, ...paragraphs, go), sticky: true, closeLabel: t("about.close"), moveLabel: t("about.move") });
  go.addEventListener("click", () => {
    sendSubmission(doc, t, run);
    tip.close();
  });
  return tip;
}
