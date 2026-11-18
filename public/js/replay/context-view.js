// The Context tab: for the chosen agent, one row per model call with what the call was made of.
import { h } from "../dom.js";

// The parts in the order they are drawn, with the class that gives each its colour.
export const CONTEXT_PARTS = [
  { key: "system", cls: "s1", label: "insp.ctx.system" },
  { key: "task", cls: "s2", label: "insp.ctx.task" },
  { key: "others", cls: "s3", label: "insp.ctx.others" },
  { key: "notebook", cls: "s4", label: "insp.ctx.notebook" },
  { key: "own", cls: "s5", label: "insp.ctx.own" },
];

// The share of each part in the whole, in whole percents that add up to 100 (the bar uses classes, not inline styles).
// Parts with nothing in them are left out. A part with a few characters still gets 1 percent so that it can be seen.
export function shares(parts) {
  const used = CONTEXT_PARTS.filter((p) => (parts[p.key] || 0) > 0).map((p) => ({ ...p, chars: parts[p.key] }));
  const total = used.reduce((n, p) => n + p.chars, 0);
  if (total === 0) return [];
  // Largest remainder: round down, then give the leftover percents to the biggest remainders.
  const raw = used.map((p) => (p.chars / total) * 100);
  const pct = raw.map((x) => Math.max(1, Math.floor(x)));
  let left = 100 - pct.reduce((n, x) => n + x, 0);
  const order = raw.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) pct[order[k][1]] += 1;
  while (left < 0) {
    const biggest = pct.indexOf(Math.max(...pct));
    pct[biggest] -= 1;
    left += 1;
  }
  return used.map((p, i) => ({ ...p, pct: pct[i] }));
}

// `rows` is what contextOf gives. `help` is a function that makes the ? for a Help section.
export function contextView({ doc, t, rows, label = "", num = (n) => String(n) }) {
  if (rows.length === 0) return h(doc, "p", { class: "doc", "data-ui": "context-none" }, t("insp.context.none"));
  const present = CONTEXT_PARTS.filter((p) => rows.some((row) => (row.parts[p.key] || 0) > 0));
  const legend = h(doc, "div", { class: "ctx-legend", "data-ui": "context-legend" }, ...present.map((p) => h(doc, "span", {}, h(doc, "i", { class: p.cls }), t(p.label))));
  const body = rows.map((row) =>
    h(
      doc,
      "tr",
      { "data-ui": "context-row" },
      h(doc, "td", {}, String(row.round)),
      h(doc, "td", {}, h(doc, "div", { class: "ctx-bar", ...(shares(row.parts).length ? { role: "img", "aria-label": shares(row.parts).map((s) => `${t(s.label)} ${s.pct} %`).join(", ") } : {}) }, ...shares(row.parts).map((s) => h(doc, "i", { class: `${s.cls} w${s.pct}`, title: `${t(s.label)}: ${num(s.chars)}` })))),
      h(doc, "td", { class: "n" }, num(row.input)),
    ),
  );
  return h(
    doc,
    "div",
    { "data-ui": "context-view" },
    h(doc, "p", { class: "ctx-heading", "data-ui": "context-heading" }, h(doc, "b", {}, label), " ", h(doc, "span", { class: "badge" }, t("insp.context.calls", { n: rows.length }))),
    legend,
    h(doc, "table", { class: "result-table ctx-table" }, h(doc, "thead", {}, h(doc, "tr", {}, h(doc, "th", { scope: "col" }, t("insp.context.call")), h(doc, "th", { scope: "col" }, t("insp.context.madeOf")), h(doc, "th", { scope: "col", class: "n" }, t("insp.context.input")))), h(doc, "tbody", {}, ...body)),
    h(doc, "p", { class: "warn", "data-ui": "context-note" }, t("insp.context.note")),
  );
}

// The figure on the Statistics tab: one bar for every model call, in order, the highest one at full height.
// `points` is what contextPerCall gives. Null when there are no calls.
export function contextChart({ doc, t, points, num = (n) => String(n), help = null }) {
  if (points.length === 0) return null;
  const top = Math.max(...points.map((p) => p.input), 1);
  const columns = points.map((p) => {
    const pct = Math.max(5, Math.min(100, Math.round(((p.input / top) * 100) / 5) * 5));
    return h(doc, "div", { class: "ctx-col" }, h(doc, "i", { class: `h${pct}`, title: `${p.label}, ${t("insp.context.call")} ${p.round}: ${num(p.input)}` }), h(doc, "span", {}, p.label));
  });
  return h(doc, "div", { class: "card ctx-chart", "data-ui": "context-chart" }, h(doc, "b", {}, t("stats.contextPerCall")), ...(help ? [help] : []), h(doc, "div", { class: "ctx-cols", role: "img", "aria-label": `${t("stats.contextPerCall")}: ${points.map((p) => `${p.label} ${num(p.input)}`).join(", ")}` }, ...columns), h(doc, "p", { class: "hint" }, t("stats.contextHint")));
}
