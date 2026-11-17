// The row in the Retry menu (and under Carry on the failed run): a checkbox to use the current limits from Settings,
// a limit details link that opens a table of both sets, and, when the run will probably stop with the new limits,
// a button that opens the Harness lab with this run and these limits.
import { h } from "../dom.js";
import { compareLimits, predictStop, labHref } from "./limits-compare.js";

// current: the limits of Settings; original: the limits the run had; record: the run (for the guess and the lab link).
// initial: whether the box starts checked. onChange(useCurrent) is called when it changes.
export function limitsChoice({ doc, t, current, original, record = null, repeatStop = 0, initial = true, onChange = () => {} }) {
  const compare = compareLimits(current, original);
  const state = { useCurrent: initial, open: false };
  const root = h(doc, "div", { class: "limits-choice", "data-ui": "limits-choice" });
  const box = h(doc, "input", { type: "checkbox", id: `lc-${Math.random().toString(36).slice(2, 8)}`, "data-ui": "limits-use-current", checked: initial });
  const label = h(doc, "label", { for: box.id }, t("limits.useCurrent"));
  box.addEventListener("change", () => {
    state.useCurrent = box.checked;
    onChange(state.useCurrent);
  });
  const rowEl = h(doc, "div", { class: `limits-row${compare.differs ? " differs" : ""}`, "data-ui": "limits-row" }, box, label);
  root.append(rowEl);

  if (!compare.differs) {
    root.append(h(doc, "p", { class: "hint limits-same", "data-ui": "limits-same" }, t("limits.same", { steps: compare.now.maxSteps, tokens: compare.now.maxTokens.toLocaleString("en-US"), searches: compare.now.maxSearches })));
    return { element: root, useCurrent: () => state.useCurrent };
  }

  const toggle = h(doc, "button", { type: "button", class: "linklike limits-toggle", "data-ui": "limits-details", "aria-expanded": "false" }, t("limits.details"));
  rowEl.append(h(doc, "span", { class: "limits-spacer" }), toggle);
  const details = h(doc, "div", { class: "limits-details", "data-ui": "limits-table", hidden: true });
  const fmt = (key, value) => (key === "maxTokens" ? value.toLocaleString("en-US") : String(value));
  details.append(
    h(
      doc,
      "table",
      { class: "limits-table" },
      h(doc, "tr", {}, h(doc, "th", {}), h(doc, "th", {}, t("limits.now")), h(doc, "th", {}, t("limits.had"))),
      ...compare.rows.map((r) => h(doc, "tr", { class: r.differs ? "diff" : "", "data-differs": String(r.differs) }, h(doc, "td", {}, t(r.label)), h(doc, "td", {}, fmt(r.key, r.now)), h(doc, "td", {}, fmt(r.key, r.had), r.differs ? h(doc, "span", { class: "limits-mark" }, ` ${t("limits.differs")}`) : ""))),
    ),
    h(doc, "p", { class: "hint" }, t("limits.explain")),
  );
  const guess = record ? predictStop(record, current, repeatStop) : null;
  if (guess) {
    const why = t(`lab.why.${guess.reason}`, { value: guess.reason === "tokens" ? guess.value.toLocaleString("en-US") : guess.value });
    const go = h(doc, "button", { type: "button", "data-ui": "limits-lab" }, t("limits.tryLab"));
    go.addEventListener("click", () => {
      doc.defaultView.location.hash = labHref(record, current, repeatStop);
    });
    details.append(h(doc, "div", { class: "limits-predict", "data-ui": "limits-predict", role: "status" }, t("limits.predict", { n: guess.step, why }), h(doc, "br"), go));
  }
  root.append(details);
  toggle.addEventListener("click", () => {
    state.open = !state.open;
    details.hidden = !state.open;
    toggle.setAttribute("aria-expanded", String(state.open));
    toggle.textContent = t(state.open ? "limits.hide" : "limits.details");
  });
  return { element: root, useCurrent: () => state.useCurrent };
}
