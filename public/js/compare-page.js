// The Compare page of Play: loads the chosen runs and shows the comparison (table and side by side).
import { h } from "./dom.js";
import { setTitle } from "./pages.js";
import { compareTable } from "./compare-view.js";
import { createVerdictStore } from "./compare-verdict.js";
import { compareSide } from "./compare-side.js";
import { helpIcon } from "./help-popup.js";

// The browser storage, or null when the browser blocks it (reading the getter can throw).
export function safeStorage(win = globalThis) {
  try {
    return win.localStorage ?? null;
  } catch {
    return null;
  }
}

// The runs of a comparison, in the order of the ids; the ones that cannot be opened are listed as missing.
export async function loadCompareRuns(ids, loader) {
  const runs = [];
  const missing = [];
  for (const id of ids) {
    let found = null;
    try {
      found = await loader(id);
    } catch {
      found = null;
    }
    if (found?.run) runs.push(found.run);
    else missing.push(id);
  }
  return { runs, missing };
}

export async function renderCompare(ctx, ids, loader) {
  const { doc, t } = ctx;
  setTitle(ctx, t("compare.title"));
  const title = h(doc, "div", { class: "compare-head" }, h(doc, "h1", {}, t("compare.title"), helpIcon({ doc, t, id: "compare-runs", name: t("compare.title") })));
  const host = h(doc, "div", { class: "compare-page", "data-ui": "compare-page" }, title);
  ctx.main.replaceChildren(host);
  const { runs, missing } = await loadCompareRuns(ids, loader);
  if (ctx.isStale()) return;
  if (missing.length > 0) host.append(h(doc, "p", { class: "notice", role: "alert", "data-ui": "compare-missing" }, t("compare.missing", { ids: missing.join(", ") })));
  if (runs.length < 2) {
    host.append(h(doc, "p", { class: "notice", "data-ui": "compare-too-few" }, t("compare.tooFew")), h(doc, "p", {}, h(doc, "a", { href: "#/play" }, t("compare.back"))));
    return;
  }
  const store = createVerdictStore(safeStorage());
  const num = (n) => new Intl.NumberFormat(ctx.lang).format(n);
  const body = h(doc, "div", { "data-ui": "compare-body" });
  const tab = h(doc, "button", { type: "button", "data-ui": "compare-view-table" }, t("compare.view.table"));
  const side = h(doc, "button", { type: "button", "data-ui": "compare-view-side" }, t("compare.view.side"));
  let current = null;
  const show = (view) => {
    current?.destroy?.();
    current = null;
    tab.setAttribute("aria-pressed", String(view === "table"));
    side.setAttribute("aria-pressed", String(view === "side"));
    if (view === "side") {
      current = compareSide({ doc, t, runs, clockApi: ctx.win ?? globalThis, num: num });
      body.replaceChildren(current.element);
    } else {
      body.replaceChildren(compareTable({ doc, t, runs, num: num, store }));
    }
  };
  tab.addEventListener("click", () => show("table"));
  side.addEventListener("click", () => show("side"));
  ctx.onLeave?.(() => current?.destroy?.());
  title.append(h(doc, "div", { class: "compare-switch", role: "group", "aria-label": t("compare.view.label") }, tab, side));
  host.append(body);
  show("table");
}
