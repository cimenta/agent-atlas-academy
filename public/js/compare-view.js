// The table view of a comparison: what changed, what it changed (time, cost, tokens, ...), the results side by side,
// and the student's own verdict. Neutral on purpose: an arrow shows a direction, never good or bad.
import { h } from "./dom.js";
import { differences, metricsRows, headline, finalText } from "./compare-model.js";
import { MODELS } from "./engine/catalog.js";
import { designLabel } from "./replay/inspect-model.js";
import { providerChips } from "./provider-colors.js";
import { helpIcon } from "./help-popup.js";

const letter = (i) => String.fromCharCode(65 + i);
const DASH = "–";

// One value of a "what changed" row, as the student reads it.
function valueText(t, num, row, value) {
  if (value === null || value === undefined) return DASH;
  switch (row.kind) {
    case "agents":
      return value;
    case "pattern":
      return t(`pattern.${value}`);
    case "model":
      return MODELS.find((m) => m.key === value)?.label ?? String(value);
    case "notebookChoice":
      return t(`compare.nb.${value}`);
    case "search":
    case "condense":
    case "notebook":
      return t(value ? "compare.on" : "compare.off");
    case "provider":
      return providerChips(String(value)).map((c) => c.name).join(" + ") || String(value);
    case "language":
      return t(`lang.${value}`);
    case "limit":
    case "agentLimit":
      return row.id.endsWith("maxCostUsd") ? `$${num(value)}` : num(value);
    default:
      return typeof value === "number" ? num(value) : String(value);
  }
}

function figure(t, num, key, value) {
  if (value === null || value === undefined) return DASH;
  switch (key) {
    case "ms":
      return `${num(Math.round(value / 100) / 10)} s`;
    case "cost":
      return `$${value.toFixed(4)}`;
    case "outcome":
      return t(`result.status.${value}`);
    default:
      return num(value);
  }
}

const COUNTS = new Set(["steps", "notes", "saved"]);

// The difference from the base: a plain number for counts, a whole percent for the rest, and the figure itself when the base is 0.
function delta(t, num, key, d) {
  if (!d) return "";
  if (Math.abs(d.abs) < 1e-9) return "= 0";
  const arrow = d.abs > 0 ? "▲" : "▼";
  if (COUNTS.has(key)) return `${arrow} ${num(Math.abs(d.abs))}`;
  if (d.pct === null) return `${arrow} ${figure(t, num, key, Math.abs(d.abs))}`;
  return `${arrow} ${num(Math.round(Math.abs(d.pct)))} %`;
}

// "88 % more" for the cost, "41 % longer" for the time.
function movement(t, num, pct, more, less) {
  if (pct === null || pct === undefined) return t("compare.unknownFig");
  const n = Math.round(Math.abs(pct));
  if (n === 0) return t("compare.same");
  return t(pct > 0 ? more : less, { n: num(n) });
}

const nodesOf = (run) => (Array.isArray(run?.design?.nodes) ? run.design.nodes : []);

export function compareTable({ doc, t, runs, num = String, store }) {
  const ids = runs.map((r) => r.id);
  const diff = differences(runs);
  const head = headline(runs);
  const letters = runs.map((_, i) => letter(i));
  const agentName = (id) => {
    for (const run of runs) if (nodesOf(run).some((n) => n.id === id)) return designLabel(run.design, id);
    return id;
  };

  // One "Agents" row replaces the per-agent presence rows: the agents of each run, and a mark when a run has agents the base does not.
  const rows = [];
  let agentsDone = false;
  for (const row of diff.rows) {
    if (row.kind !== "agentPresence") {
      rows.push(row);
      continue;
    }
    if (agentsDone) continue;
    agentsDone = true;
    const base = new Set(nodesOf(runs[0]).map((n) => n.id));
    rows.push({
      id: "agents",
      kind: "agents",
      values: runs.map((run, i) => {
        const list = nodesOf(run).map((n) => designLabel(run.design, n.id)).join(", ");
        const extra = i > 0 && nodesOf(run).some((n) => !base.has(n.id));
        return extra ? `${list} · ${t("compare.notIn", { run: letters[0] })}` : list;
      }),
    });
  }
  const labelOf = (row) => {
    if (row.kind === "limit" || row.kind === "agentLimit") return t(`compare.k.${row.kind}.${row.id.split(":").at(-1)}`, { agent: agentName(row.agent) });
    return t(`compare.k.${row.kind}`, { agent: row.agent ? agentName(row.agent) : "" });
  };
  const headCells = () => letters.map((l, i) => h(doc, "th", { scope: "col", title: runs[i].title ?? runs[i].id }, i === 0 ? `${l} · ${t("compare.baseBadge")}` : l));
  const heading = (key) => h(doc, "h2", {}, t(key), helpIcon({ doc, t, id: "compare-runs", name: t(key) }));

  const changed = rows.map((row) => labelOf(row)).join(", ");
  const summary = h(
    doc,
    "p",
    { class: "compare-summary", "data-ui": "compare-summary" },
    t("compare.sum", { base: letters[0], run: letters.at(-1), cost: movement(t, num, head.cost, "compare.more", "compare.less"), time: movement(t, num, head.ms, "compare.longer", "compare.shorter") }),
    " ",
    rows.length > 0 ? t("compare.sumChanged", { list: changed }) : t("compare.noChanges"),
  );

  const root = h(doc, "div", { class: "compare-table-view", "data-ui": "compare-table" }, summary);
  if (diff.tasksDiffer) root.append(h(doc, "p", { class: "notice", role: "status", "data-ui": "compare-tasks-differ" }, t("compare.tasksDiffer")));

  // What changed
  root.append(heading("compare.changed"));
  if (rows.length === 0) {
    root.append(h(doc, "p", { class: "muted", "data-ui": "compare-no-changes" }, t("compare.noChanges")));
  } else {
    root.append(
      h(
        doc,
        "table",
        { class: "compare-grid", "data-ui": "compare-changes" },
        h(doc, "thead", {}, h(doc, "tr", {}, h(doc, "th", { scope: "col" }, t("compare.what")), ...headCells())),
        h(doc, "tbody", {}, ...rows.map((row) => h(doc, "tr", { "data-ui": "compare-change-row" }, h(doc, "th", { scope: "row" }, labelOf(row)), ...row.values.map((v) => h(doc, "td", {}, valueText(t, num, row, v)))))),
      ),
      h(doc, "p", { class: "muted", "data-ui": "compare-only-differs" }, t("compare.onlyDiffers", { n: runs.length })),
    );
  }

  // What it changed
  root.append(heading("compare.effect"));
  root.append(
    h(
      doc,
      "table",
      { class: "compare-grid", "data-ui": "compare-metrics" },
      h(doc, "thead", {}, h(doc, "tr", {}, h(doc, "th", { scope: "col" }, t("compare.what")), ...headCells())),
      h(
        doc,
        "tbody",
        {},
        ...metricsRows(runs).map((row) =>
          h(
            doc,
            "tr",
            { "data-ui": `compare-metric-${row.key}` },
            h(doc, "th", { scope: "row" }, t(`compare.m.${row.key}`)),
            ...row.values.map((v, i) => h(doc, "td", {}, figure(t, num, row.key, v), row.deltas[i] ? h(doc, "span", { class: "compare-delta" }, ` ${delta(t, num, row.key, row.deltas[i])}`) : "")),
          ),
        ),
      ),
    ),
  );
  root.append(h(doc, "p", { class: "muted" }, t("compare.neutral")));

  // The results
  root.append(heading("compare.result"));
  root.append(
    h(
      doc,
      "div",
      { class: "compare-results", "data-ui": "compare-results" },
      ...runs.map((run, i) => {
        const text = finalText(run);
        return h(doc, "section", { class: "compare-answer", "data-ui": "compare-answer" }, h(doc, "h3", { title: run.title ?? run.id }, i === 0 ? `${letters[i]} · ${t("compare.baseBadge")}` : letters[i]), h(doc, "div", { class: text === null ? "muted" : "compare-answer-text" }, text ?? t("compare.noAnswer")));
      }),
    ),
  );

  // The student's own verdict: quality cannot be measured, so the student decides.
  if (!diff.tasksDiffer) {
    const saved = store.get(ids) ?? { pick: "", note: "" };
    let pick = saved.pick;
    let note = saved.note;
    const chips = [];
    const status = h(doc, "p", { class: "muted", "data-ui": "compare-verdict-status", role: "status" }, t("compare.verdictKept"));
    const mark = () => chips.forEach(({ el, value }) => el.setAttribute("aria-pressed", String(pick === value)));
    const keep = () => {
      if (pick === "" && note === "") return;
      const ok = store.set(ids, { pick, note });
      status.replaceChildren(doc.createTextNode(t(ok ? "compare.verdictKept" : "compare.verdictFailed")));
    };
    const choose = (value, text, label) => {
      const el = h(doc, "button", { type: "button", class: "chip", "data-ui": "compare-pick", "aria-pressed": "false", title: label }, text);
      el.addEventListener("click", () => {
        pick = value;
        keep();
        mark();
      });
      chips.push({ el, value });
      return el;
    };
    const field = h(doc, "input", { type: "text", maxlength: 200, class: "compare-note", "data-ui": "compare-note", "aria-label": t("compare.verdictNote"), placeholder: t("compare.verdictNote") });
    field.value = note;
    const takeNote = () => {
      note = field.value ?? "";
      keep();
    };
    field.addEventListener("input", takeNote);
    field.addEventListener("change", takeNote);
    root.append(
      h(
        doc,
        "section",
        { class: "compare-verdict", "data-ui": "compare-verdict" },
        h(doc, "h2", {}, t("compare.verdictAsk")),
        h(doc, "div", { class: "chips", role: "group", "aria-label": t("compare.verdictAsk") }, ...runs.map((run, i) => choose(run.id, letters[i], run.title ?? run.id)), choose("none", t("compare.verdictNone"), t("compare.verdictNone"))),
        field,
        status,
      ),
    );
    mark();
  }
  return root;
}
