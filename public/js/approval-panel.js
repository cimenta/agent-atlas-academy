// The panel of a run that waits for human approval: what each waiting agent will receive, and the two choices.
import { h } from "./dom.js";
import { helpIcon } from "./help-popup.js";

// pending: the approval events still open. onApprove / onStop are called without arguments.
export function approvalPanel({ doc, t, pending, onApprove, onStop, canApprove = true }) {
  const approve = h(doc, "button", { type: "button", class: "primary", "data-ui": "approve" }, t("approval.approve"));
  const stop = h(doc, "button", { type: "button", "data-ui": "approval-stop" }, t("approval.stop"));
  approve.addEventListener("click", () => onApprove());
  stop.addEventListener("click", () => onStop());
  return h(
    doc,
    "section",
    { class: "approval-panel", "data-ui": "approval-panel", role: "status" },
    h(doc, "div", { class: "approval-head" }, h(doc, "h3", {}, t("approval.heading"), helpIcon({ doc, t, id: "play-approval", name: t("approval.heading") })), h(doc, "span", { class: "tag tag-paused" }, t("approval.paused"))),
    ...pending.flatMap((e) => [
      h(doc, "p", { class: "hint" }, t("approval.next", { agent: e.role ?? e.agent })),
      h(doc, "pre", { class: "approval-input", "data-ui": "approval-input" }, e.input ?? ""),
      ...(e.inputChars > (e.input ?? "").length ? [h(doc, "p", { class: "hint" }, t("approval.cut", { shown: (e.input ?? "").length, total: e.inputChars }))] : []),
    ]),
    h(doc, "div", { class: "approval-actions" }, approve, stop),
    ...(canApprove ? [] : [h(doc, "p", { class: "notice", role: "alert" }, t("create.retryNeedsKeyLive"))]),
    h(doc, "p", { class: "hint" }, t("approval.stopNote")),
  );
}
