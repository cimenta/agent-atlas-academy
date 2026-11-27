// The Steps tab as the approved mockup draws it (docs/mockups/step-card.html): one list of the steps of the whole run
// (or of one agent when it is picked), and next to it the step card: what the step was given, what it did, where the result went.
// The data comes from step-model.js; this file only draws it.
import { h } from "../dom.js";
import { involved, receivedOf, passedOf } from "./step-model.js";

const PART_COLOR = { system: "--c1", task: "--c2", others: "--c3", notebook: "--c4", own: "--c5" };
const ORIGIN_SHORT = { model: "model", rule: "rule", harness: "harness" };

// Every agent has one colour (eight in turn), used on its stripe in the list, its name and its lane on the timeline.
export const agentColor = (state, id) => `var(--ag${Math.max(0, state.order.indexOf(id)) % 8})`;

const dot = (doc, state, id) => h(doc, "span", { class: "wd", style: `background:${agentColor(state, id)}` });

// A stripe on the left of a row: the colour of the agent, or from the sender to the receiver of a handoff.
function stripe(state, item) {
  const ids = involved(item);
  const colors = ids.map((id) => agentColor(state, id));
  if (colors.length === 1) colors.push(colors[0]);
  return `background-image:linear-gradient(to bottom,${colors.join(",")});background-size:5px 100%;background-repeat:no-repeat;background-position:left`;
}

export function whoLine({ doc, state, item, nameOf }) {
  const ids = involved(item);
  const parts = [];
  ids.forEach((id, i) => {
    if (i > 0) parts.push(" → ");
    parts.push(dot(doc, state, id), nameOf(id));
  });
  return h(doc, "span", { class: "who" }, ...parts);
}

export function stepRow({ doc, t, state, item, selected, current, nameOf, title, fmt, onClick }) {
  const step = item.step;
  const isHandoff = step.kind === "handoff" && !step.created && !step.refused;
  const tag = isHandoff ? h(doc, "span", { class: "tg o-rule" }, `✉ ${t("sc.handoff")}`) : h(doc, "span", { class: `tg o-${item.origin}`, "data-kind": step.kind }, t(`sc.origin.short.${ORIGIN_SHORT[item.origin]}`));
  const end = current ? h(doc, "span", { class: "now" }, t("sc.now")) : h(doc, "span", { class: "ms" }, step.ms != null ? fmt(step.ms) : "");
  const body = isHandoff
    ? h(doc, "span", { class: "ti" }, whoLine({ doc, state, item, nameOf }), h(doc, "span", { class: "who" }, typeof step.output === "string" ? t("sc.chars", { n: step.output.length }) : ""))
    : h(doc, "span", { class: "ti" }, whoLine({ doc, state, item, nameOf }), title);
  const checkClass = step.kind === "check" ? (step.action === "noted" ? " check-note" : step.ok ? " check-ok" : " check-bad") : "";
  const button = h(doc, "button", { type: "button", class: `step ag-row${isHandoff ? " ho-row" : ""}${selected ? " sel" : ""}${step.refused ? " refused" : ""}${checkClass}`, style: stripe(state, item), "data-kind": step.kind, "aria-current": selected ? "step" : undefined }, tag, body, end);
  button.addEventListener("click", onClick);
  return button;
}

// The bar that shows what the input of a call was made of, with its legend.
export function partsBar({ doc, t, parts }) {
  const total = parts.reduce((n, p) => n + p.chars, 0);
  if (total === 0) return null;
  const bar = h(doc, "div", { class: "sc-bar", role: "img", "aria-label": t("sc.partsBar") }, ...parts.map((p) => h(doc, "i", { title: `${t(`sc.part.${p.part}`)}: ${p.chars}`, style: `width:${((p.chars / total) * 100).toFixed(1)}%;background:var(${PART_COLOR[p.part]})` })));
  const legend = h(doc, "div", { class: "sc-legend" }, ...parts.map((p) => h(doc, "span", {}, h(doc, "i", { style: `background:var(${PART_COLOR[p.part]})` }), `${t(`sc.part.${p.part}`)} · ${Math.round((p.chars / total) * 100)} %`)));
  return h(doc, "div", {}, bar, legend);
}

function handoffStrip({ doc, state, step, nameOf }) {
  const end = (id) => h(doc, "span", { class: "sc-hn", style: `border-color:${agentColor(state, id)}` }, dot(doc, state, id), nameOf(id));
  return h(doc, "div", { class: "sc-hand" }, end(step.from), h(doc, "span", { class: "sc-har" }, h(doc, "span", { class: "sc-line" }), h(doc, "span", { class: "sc-envl" }, "✉"), h(doc, "span", { class: "sc-line" }), "▶"), end(step.to));
}

const block = (doc, kind, heading, ...children) => h(doc, "div", { class: `sc-${kind}` }, h(doc, "b", {}, heading), ...children);

// The card of one step. `detail` is the exact input and output of the step (the old detail box), shown under "Details".
export function stepCard({ doc, t, events, state, item, cursor, nameOf, title, why, tip, detail, fmt, simple = false, onFullView = null }) {
  const step = item.step;
  const isHandoff = step.kind === "handoff" && !step.created && !step.refused;
  const root = h(doc, "div", { class: "step-card", "data-ui": "step-detail" }, h(doc, "p", { class: "lb" }, t("insp.whatHappens")));
  root.append(h(doc, "h3", {}, title, " ", h(doc, "span", { class: `badge b-${item.origin}` }, t(`sc.origin.${item.origin}`))));
  const facts = [];
  if (typeof step.at === "number") facts.push(t("insp.at", { time: fmt(step.at) }));
  if (typeof step.ms === "number") facts.push(t("insp.tookTime", { time: fmt(step.ms) }));
  root.append(h(doc, "p", { class: "sm" }, whoLine({ doc, state, item, nameOf }), facts.length ? ` ${facts.join(" · ")}` : ""));
  if (isHandoff) root.append(handoffStrip({ doc, state, step, nameOf }));

  const got = receivedOf(events, state, item, cursor);
  const passed = passedOf(state, item);
  const passedText = passed.kind === "agents" ? t("sc.passed.agents", { names: passed.agents.map(nameOf).join(", ") }) : passed.kind === "result" ? t("sc.passed.result") : passed.kind === "nowhere" ? t("sc.passed.nowhere") : t("sc.passed.self");
  const did = t(step.kind === "tool" ? `insp.doc.${step.tool}` : step.kind === "check" && step.tool === "guardrail" ? "insp.doc.guardrail" : `insp.doc.${step.kind}`);
  root.append(
    h(
      doc,
      "div",
      { class: "sc-io" },
      block(doc, "in", t("sc.got"), ...(got.length ? got.map((p) => h(doc, "span", { class: "sc-chip", title: String(p.chars) }, h(doc, "i", { style: `background:var(${PART_COLOR[p.part]})` }), t(`sc.part.${p.part}`))) : [h(doc, "span", { class: "sm" }, t("sc.gotNothing"))])),
      block(doc, "do", t("sc.did"), did.startsWith("insp.doc.") ? title : did),
      block(doc, "out", t("sc.passed"), passedText),
    ),
  );
  root.append(h(doc, "p", { class: "sc-why" }, h(doc, "strong", {}, `${t("sc.why")}: `), why || t(`sc.origin.explain.${item.origin}`)));
  if (tip) root.append(h(doc, "p", { class: "sc-tip" }, `💡 ${tip}`));
  if (simple) {
    // The simple view stops here: the exact messages, tokens and settings are in the full view, and it says so.
    const link = h(doc, "button", { type: "button", class: "link-cancel", "data-ui": "show-full-view" }, t("sc.showFull"));
    link.addEventListener("click", () => onFullView?.());
    root.append(h(doc, "p", { class: "sc-default" }, `${t("sc.defaultSettings")} `, ...(onFullView ? [link] : [])));
    return root;
  }
  const bar = step.kind === "model" ? partsBar({ doc, t, parts: got }) : null;
  const details = h(doc, "details", { class: "sc-details", open: "" }, h(doc, "summary", {}, t("sc.details")), ...(bar ? [h(doc, "p", { class: "lb" }, t("sc.partsHeading")), bar, h(doc, "p", { class: "sm" }, t("sc.partsNote"))] : []), detail);
  root.append(details);
  return root;
}
