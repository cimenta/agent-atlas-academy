// The notice that says how a run ended: icon, message, time and cost.
import { h } from "./dom.js";
import { describeOutcome, formatDuration, formatUsd, runOutcomeMessageKey } from "./create/create-model.js";

// tryCost: for a run carried on after a failure, what this try alone cost (cost is then the whole run), so a retry of one
// free agent does not read as if it cost what the earlier agents did.
export function outcomeNotice({ doc, t, outcome, events, cost, durationMs, free = false, tryCost = null }) {
  const info = describeOutcome({ outcome, events, cost });
  const took = typeof durationMs === "number" ? durationMs : info.durationMs;
  const meta = [];
  if (took !== null) meta.push(t("run.outcome.took", { time: formatDuration(took) }));
  if (typeof tryCost === "number" && info.cost !== null) {
    meta.push(tryCost < 0.00005 ? t("run.outcome.tryFree") : t("run.outcome.tryCost", { usd: formatUsd(tryCost) }));
    if (info.cost >= 0.00005) meta.push(t("run.outcome.wholeCost", { usd: formatUsd(info.cost) }));
  } else if (info.cost !== null) meta.push(free ? t("run.outcome.costFree") : t("run.outcome.cost", { usd: formatUsd(info.cost) }));
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

// The notice that says how an evaluator loop ended: accepted, not accepted (the rounds ran out) or stopped by a limit.
// `loop` is what loopOutcome gives. The text is the same on the Result tab and at the end of a replay.
export function loopNotice({ doc, t, loop }) {
  const params = { n: loop.round, total: loop.rounds };
  const parts = {
    accepted: { level: "ok", icon: "✓", title: "loop.accepted", body: "loop.accepted.body" },
    not_accepted: { level: "warn", icon: "⚠", title: "loop.notAccepted", body: "loop.notAccepted.body" },
    stopped: { level: "fail", icon: "■", title: "loop.stopped", body: loop.judged ? "loop.stopped.judged" : "loop.stopped.unjudged" },
  }[loop.result];
  if (!parts) return null;
  return h(
    doc,
    "div",
    { class: `notice outcome outcome-${parts.level}`, "data-ui": "loop-outcome", "data-loop": loop.result, role: "status" },
    h(doc, "span", { class: "outcome-icon", "aria-hidden": "true" }, parts.icon),
    h(doc, "span", { class: "outcome-text" }, h(doc, "strong", {}, t(parts.title, params)), " ", t(parts.body, params)),
  );
}
