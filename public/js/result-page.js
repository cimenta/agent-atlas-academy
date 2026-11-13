// The Result tab: how the run ended, the final answer (formatted or raw, copy, export) and statistics.
import { h } from "./dom.js";
import { parseMarkdown } from "./markdown.js";
import { renderBlocks } from "./render.js";
import { buildResultModel, buildStatistics } from "./play-model.js";
import { copyText, downloadFile, safeFileName } from "./download.js";
import { formatDuration, formatUsd } from "./create/create-model.js";
import { outcomeNotice } from "./outcome-view.js";
import { markText, searchBar } from "./text-search.js";

const PAGE_CSS = "body{font:16px/1.6 system-ui,Segoe UI,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1f2328}h1,h2,h3{line-height:1.25}pre{background:#f3f3f1;padding:12px;overflow:auto}code{background:#f3f3f1;padding:0 4px}";

const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function formatWhen(iso, lang) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(lang);
}

export function renderResult(ctx, run) {
  const { doc, t } = ctx;
  const model = buildResultModel(run);
  const stats = buildStatistics(run);
  const answer = model.finalText || "";
  const ui = { tab: "answer", view: "formatted", q: "" };

  const head = h(doc, "div", { class: "result-head" }, h(doc, "h2", {}, t("result.title", { title: run.title })));
  const outcome = outcomeNotice({ doc, t, outcome: model.status, events: run.events, cost: model.cost, free: model.free, durationMs: stats.totalMs });
  outcome.append(h(doc, "a", { href: `#/play/run/${run.id}`, class: "outcome-link" }, t("result.watch")));
  const tabs = h(doc, "div", { class: "result-tabs", role: "tablist", "data-ui": "result-tabs" });
  const body = h(doc, "div", { class: "result-body", "data-ui": "result-body" });

  const drawTabs = () => {
    tabs.replaceChildren(
      ...[
        ["answer", "result.tab.answer"],
        ["stats", "result.tab.stats"],
      ].map(([name, key]) => {
        const button = h(doc, "button", { type: "button", role: "tab", class: "tab", "aria-selected": String(ui.tab === name), "data-ui": `result-tab-${name}` }, t(key));
        button.addEventListener("click", () => {
          ui.tab = name;
          draw();
        });
        return button;
      }),
    );
  };

  const answerView = () => {
    if (!answer) return h(doc, "p", { class: "notice" }, t("result.noText"));
    const cleanArticle = () => {
      const article = h(doc, "article", { class: "answer rendered", "data-ui": "answer-formatted" });
      article.append(renderBlocks(parseMarkdown(answer), doc));
      return article;
    };
    const holder = h(doc, "div", { class: "answer-holder" });
    const search = searchBar({
      doc,
      t,
      value: ui.q,
      placeholder: t("result.search"),
      ui: "answer-search",
      apply: (q) => {
        ui.q = q;
        holder.replaceChildren(ui.view === "raw" ? h(doc, "pre", { class: "raw", "data-ui": "answer-raw" }, answer) : cleanArticle());
        return markText(doc, holder, q);
      },
    });

    const copied = h(doc, "span", { class: "copy-note", role: "status" });
    const copy = h(doc, "button", { type: "button", class: "icon-button", "data-ui": "answer-copy", title: t("result.copy"), "aria-label": t("result.copy") }, "⧉", " ", h(doc, "span", { class: "label" }, t("result.copy")));
    copy.addEventListener("click", async () => {
      const text = ui.view === "raw" ? answer : (holder.innerText ?? holder.textContent);
      copied.textContent = (await copyText(doc, text)) ? t("result.copied") : t("result.copyFailed");
      setTimeout(() => (copied.textContent = ""), 2500);
    });

    const segment = h(
      doc,
      "div",
      { class: "seg", role: "group", "aria-label": t("result.viewLabel"), "data-ui": "answer-view" },
      ...["formatted", "raw"].map((name) => {
        const button = h(doc, "button", { type: "button", "aria-pressed": String(ui.view === name), "data-view": name }, t(`result.view.${name}`));
        button.addEventListener("click", () => {
          ui.view = name;
          draw();
        });
        return button;
      }),
    );

    const base = safeFileName(run.title, "answer");
    const exportButton = (kind, label, action) => {
      const button = h(doc, "button", { type: "button", "data-ui": `export-${kind}` }, label);
      button.addEventListener("click", action);
      return button;
    };
    const exports = h(
      doc,
      "div",
      { class: "exports", role: "group", "aria-label": t("result.export"), "data-ui": "answer-export" },
      h(doc, "span", { class: "label" }, `${t("result.export")}:`),
      exportButton("md", ".md", () => downloadFile(doc, `${base}.md`, answer, "text/markdown")),
      exportButton("html", ".html", () => {
        const page = `<!doctype html><html lang="${escapeHtml(ctx.lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(run.title)}</title><style>${PAGE_CSS}</style></head><body>${cleanArticle().innerHTML}</body></html>`;
        downloadFile(doc, `${base}.html`, page, "text/html");
      }),
      exportButton("pdf", t("result.export.pdf"), () => doc.defaultView.print()),
    );

    search.run();
    return h(doc, "div", { class: "answer-wrap" }, h(doc, "div", { class: "answer-toolbar noprint" }, segment, copy, copied, exports), search.element, holder);
  };

  const statsView = () => {
    const tile = (value, label) => h(doc, "div", { class: "stat" }, h(doc, "b", {}, value), h(doc, "span", {}, label));
    const num = (n) => new Intl.NumberFormat(ctx.lang).format(n);
    const tiles = h(
      doc,
      "div",
      { class: "stats", "data-ui": "stats-tiles" },
      tile(stats.totalMs === null ? "—" : formatDuration(stats.totalMs), t("stats.time")),
      tile(stats.cost === null ? "—" : stats.free ? t("stats.free") : `≈ $${formatUsd(stats.cost)}`, t("stats.cost")),
      tile(num(stats.usage.input), t("stats.inputTokens")),
      tile(num(stats.usage.output), t("stats.outputTokens")),
      tile(num(stats.usage.searches), t("stats.searches")),
      tile(num(stats.calls), t("stats.calls")),
    );
    const table = h(
      doc,
      "table",
      { class: "result-table stats-table", "data-ui": "stats-agents" },
      h(
        doc,
        "thead",
        {},
        h(doc, "tr", {}, ...["stats.agent", "stats.model", "stats.agentTime", "stats.input", "stats.output", "stats.share"].map((key) => h(doc, "th", { scope: "col" }, t(key)))),
      ),
      h(
        doc,
        "tbody",
        {},
        ...stats.perAgent.map((a) => {
          const pct = Math.round(a.share * 100);
          const bar = h(doc, "span", { class: "share-bar", role: "img", "aria-label": `${pct} %` }, h(doc, "i", { class: `w${Math.round(pct / 5) * 5}` }));
          return h(
            doc,
            "tr",
            {},
            h(doc, "th", { scope: "row" }, a.label),
            h(doc, "td", {}, a.model || "—"),
            h(doc, "td", {}, a.ms === null ? "—" : formatDuration(a.ms)),
            h(doc, "td", {}, num(a.input)),
            h(doc, "td", {}, num(a.output)),
            h(doc, "td", {}, bar),
          );
        }),
      ),
    );
    const when = [];
    if (stats.startedAt) when.push(t("stats.started", { time: formatWhen(stats.startedAt, ctx.lang) }));
    if (stats.endedAt) when.push(t("stats.ended", { time: formatWhen(stats.endedAt, ctx.lang) }));
    if (stats.appVersion) when.push(t("stats.appVersion", { version: stats.appVersion }));
    return h(
      doc,
      "div",
      { class: "stats-wrap" },
      tiles,
      stats.perAgent.length ? table : "",
      when.length ? h(doc, "p", { class: "stats-note" }, when.join(" · ")) : "",
      h(doc, "p", { class: "stats-note" }, t("result.costNote")),
    );
  };

  const draw = () => {
    drawTabs();
    body.replaceChildren(ui.tab === "answer" ? answerView() : statsView());
  };
  draw();
  ctx.main.replaceChildren(head, outcome, tabs, body);
}
