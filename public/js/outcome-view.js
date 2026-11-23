// The notice that says how a run ended: icon, message, time and cost.
import { h } from "./dom.js";
import { designLabel } from "./replay/inspect-model.js";
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
  // A run stopped by the provider's limit says what the provider answered and, for a limit shared among its users, that it is not the student's.
  const limitEvent = Array.isArray(events) ? events.findLast?.((e) => e?.type === "warning" && typeof e.providerMessage === "string" && e.limit) : undefined;
  if (limitEvent) {
    if (limitEvent.shared === true) notice.append(h(doc, "span", { class: "outcome-extra", "data-ui": "outcome-shared" }, t("run.outcome.sharedLimit")));
    notice.append(h(doc, "span", { class: "outcome-extra outcome-provider", "data-ui": "outcome-provider" }, t("run.outcome.providerSays", { text: limitEvent.providerMessage })));
  }
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
  // With self-critique there is no evaluator: the Writer judged its own draft, so the text says that.
  if (loop.self === true) parts.body += ".self";
  return h(
    doc,
    "div",
    { class: `notice outcome outcome-${parts.level}`, "data-ui": "loop-outcome", "data-loop": loop.result, role: "status" },
    h(doc, "span", { class: "outcome-icon", "aria-hidden": "true" }, parts.icon),
    h(doc, "span", { class: "outcome-text" }, h(doc, "strong", {}, t(parts.title, params)), " ", t(parts.body, params)),
  );
}

// The path of a handoff run: the agents control went through, in order. The agent that holds control now (or ended the run) is marked.
export function handoffPathView({ doc, t, design, path }) {
  const items = [h(doc, "strong", {}, t("handoff.path"))];
  path.forEach((id, i) => {
    if (i > 0) items.push(h(doc, "span", { class: "path-arrow", "aria-hidden": "true" }, "→"));
    items.push(h(doc, "span", { class: i === path.length - 1 ? "path-step now" : "path-step" }, designLabel(design, id)));
  });
  return h(doc, "div", { class: "handoff-path", "data-ui": "handoff-path" }, ...items);
}

// The notice that says how a handoff run ended: an agent finished it, or a limit stopped it and nobody finished.
// `outcome` is what handoffOutcome gives.
export function handoffNotice({ doc, t, design, outcome }) {
  const params = { n: outcome.handoffs, name: designLabel(design, outcome.by) };
  const parts = outcome.result === "finished" ? { level: "ok", icon: "✓", title: "handoff.finished", body: "handoff.finished.body" } : { level: "fail", icon: "■", title: "handoff.stopped", body: "handoff.stopped.body" };
  return h(
    doc,
    "div",
    { class: `notice outcome outcome-${parts.level}`, "data-ui": "handoff-outcome", "data-handoff": outcome.result, role: "status" },
    h(doc, "span", { class: "outcome-icon", "aria-hidden": "true" }, parts.icon),
    h(doc, "span", { class: "outcome-text" }, h(doc, "strong", {}, t(parts.title, params)), " ", t(parts.body, params)),
  );
}

// The notice that says how a voting run ended: a majority agreed, nobody had a majority, or a limit stopped it before the
// tally decided. `end` is what votingEnd gives.
export function votingNotice({ doc, t, end }) {
  const parts = {
    majority: { level: "ok", icon: "✓", title: "voting.majority", body: "voting.majority.body" },
    none: { level: "warn", icon: "⚠", title: "voting.none", body: "voting.none.body" },
    stopped: { level: "fail", icon: "■", title: "voting.stopped", body: "voting.stopped.body" },
  }[end.result];
  if (!parts) return null;
  const params = { votes: end.votes, total: end.total };
  return h(
    doc,
    "div",
    { class: `notice outcome outcome-${parts.level}`, "data-ui": "voting-outcome", "data-voting": end.result, role: "status" },
    h(doc, "span", { class: "outcome-icon", "aria-hidden": "true" }, parts.icon),
    h(doc, "span", { class: "outcome-text" }, h(doc, "strong", {}, t(parts.title, params)), " ", t(parts.body, params), ...(end.note && end.result !== "stopped" ? [" ", h(doc, "em", { "data-ui": "voting-outcome-note" }, end.note)] : [])),
  );
}

// The notice that says how a map-reduce or plan-and-execute run ended: finished (all parts or steps done) or stopped by a
// limit. `end` is what dynamicEnd gives. A stopped plan keeps the text of its last finished step; a stopped map-reduce has none.
export function dynamicNotice({ doc, t, end }) {
  const base = end.kind === "mapreduce" ? "mapreduce" : "planexec";
  const key = end.result === "finished" ? `${base}.finished` : end.done > 0 && base === "planexec" ? `${base}.stopped` : `${base}.stoppedEmpty`;
  const params = { n: end.total, done: end.done };
  return h(
    doc,
    "div",
    { class: `notice outcome outcome-${end.result === "finished" ? "ok" : "fail"}`, "data-ui": "dynamic-outcome", "data-dynamic": `${end.kind}-${end.result}`, role: "status" },
    h(doc, "span", { class: "outcome-icon", "aria-hidden": "true" }, end.result === "finished" ? "✓" : "■"),
    h(doc, "span", { class: "outcome-text" }, h(doc, "strong", {}, t(key, params)), " ", t(`${key}.body`, params)),
  );
}

// The notice that says how a router run ended: the chosen specialist answered, or a limit stopped it before that.
// `end` is what routerEnd gives.
export function routerNotice({ doc, t, design, end }) {
  const parts = end.result === "answered" ? { level: "ok", icon: "✓", title: "router.answered", body: "router.answered.body" } : { level: "fail", icon: "■", title: "router.stopped", body: end.to ? "router.stopped.body" : "router.stopped.early" };
  const params = { name: end.to ? designLabel(design, end.to) : "" };
  return h(
    doc,
    "div",
    { class: `notice outcome outcome-${parts.level}`, "data-ui": "router-outcome", "data-router": end.result, role: "status" },
    h(doc, "span", { class: "outcome-icon", "aria-hidden": "true" }, parts.icon),
    h(doc, "span", { class: "outcome-text" }, h(doc, "strong", {}, t(parts.title, params)), " ", t(parts.body, params)),
  );
}
