// The notice that says how a run ended: icon, message, time and cost.
import { h } from "./dom.js";
import { describeOutcome, formatDuration, formatUsd, runOutcomeMessageKey } from "./create/create-model.js";

export function outcomeNotice({ doc, t, outcome, events, cost, durationMs, free = false }) {
  const info = describeOutcome({ outcome, events, cost });
  const took = typeof durationMs === "number" ? durationMs : info.durationMs;
  const meta = [];
  if (took !== null) meta.push(t("run.outcome.took", { time: formatDuration(took) }));
  if (info.cost !== null) meta.push(free ? t("run.outcome.costFree") : t("run.outcome.cost", { usd: formatUsd(info.cost) }));
  const reason = Array.isArray(events) ? events.findLast?.((e) => e?.type === "done")?.reason : undefined;
  const notice = h(
    doc,
    "p",
    { class: `notice outcome outcome-${info.level}`, "data-ui": "run-outcome", "data-outcome": outcome ?? "failed", role: "status" },
    h(doc, "span", { class: "outcome-icon", role: "img", "aria-label": t(`run.outcome.icon.${info.level}`) }, info.icon),
    h(doc, "span", { class: "outcome-text" }, t(runOutcomeMessageKey(outcome, reason))),
  );
  if (meta.length) notice.append(h(doc, "span", { class: "outcome-meta", title: info.cost !== null ? t("run.outcome.costHint") : undefined }, meta.join(" · ")));
  return notice;
}
