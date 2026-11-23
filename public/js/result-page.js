// The Result tab: how the run ended, the final answer (formatted or raw, copy, export) and statistics.
import { h } from "./dom.js";
import { helpIcon } from "./help-popup.js";
import { parseMarkdown } from "./markdown.js";
import { renderBlocks } from "./render.js";
import { buildResultModel, buildStatistics, limitRows } from "./play-model.js";
import { runMetrics, contextPerCall } from "./replay/context-model.js";
import { contextChart } from "./replay/context-view.js";
import { copyText, downloadFile, safeFileName } from "./download.js";
import { formatDuration, formatUsd } from "./create/create-model.js";
import { outcomeNotice, loopNotice, handoffNotice, handoffPathView, routerNotice, votingNotice, dynamicNotice } from "./outcome-view.js";
import { designLabel, loopOutcome, handoffOutcome, handoffPath, routerChoice, routerEnd, votingEnd, votingTally, dynamicEnd } from "./replay/inspect-model.js";
import { markText, searchBar } from "./text-search.js";
import { paintModelTag } from "./provider-colors.js";

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
  const metrics = runMetrics(run);
  const answer = model.finalText || "";
  const ui = { tab: "answer", view: "formatted", q: "" };
  const help = (id, name) => helpIcon({ doc, t, id, name });

  const head = h(doc, "div", { class: "result-head" }, h(doc, "h2", {}, t("result.title", { title: run.title })));
  const outcome = outcomeNotice({ doc, t, outcome: model.status, events: run.events, cost: model.cost, free: model.free, durationMs: stats.totalMs });
  outcome.append(h(doc, "a", { href: `#/play/run/${run.id}`, class: "outcome-link" }, t("result.watch")), help("result-outcome", t("result.status")));
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

  const loop = loopOutcome(run.events);
  const handed = handoffOutcome(run.events);
  const routedChoice = routerChoice(run.events);
  const routedEnd = routerEnd(run.events);
  const votedEnd = votingEnd(run.events);
  const votedTally = votingTally(run.events);
  const dynEnd = dynamicEnd(run.events);
  const handPath = handoffPath(run.events);
  const handDesign = run.events.find((e) => e.type === "run_start")?.design;
  const answerView = () => {
    if (!answer) return h(doc, "div", { class: "answer-wrap" }, routedEnd ? routerNotice({ doc, t, design: handDesign, end: routedEnd }) : "", votedEnd ? votingNotice({ doc, t, end: votedEnd }) : "", dynEnd ? dynamicNotice({ doc, t, end: dynEnd }) : "", h(doc, "p", { class: "notice" }, t("result.noText")));
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
      header: true,
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
    return h(doc, "div", { class: "answer-wrap" }, loop ? loopNotice({ doc, t, loop }) : "", handed ? handoffNotice({ doc, t, design: handDesign, outcome: handed }) : "", routedEnd ? routerNotice({ doc, t, design: handDesign, end: routedEnd }) : "", votedEnd ? votingNotice({ doc, t, end: votedEnd }) : "", dynEnd ? dynamicNotice({ doc, t, end: dynEnd }) : "", h(doc, "div", { class: "answer-toolbar noprint" }, segment, copy, copied, exports), search.element, holder);
  };

  const statsView = () => {
    const tile = (value, label, helpId) => h(doc, "div", { class: "stat" }, h(doc, "b", {}, value), h(doc, "span", {}, label, helpId ? help(helpId, label) : ""));
    const num = (n) => new Intl.NumberFormat(ctx.lang).format(n);
    const tiles = h(
      doc,
      "div",
      { class: "stats", "data-ui": "stats-tiles" },
      tile(stats.totalMs === null ? "—" : formatDuration(stats.totalMs), t("stats.time")),
      tile(stats.cost === null ? "—" : stats.free ? t("stats.free") : `≈ $${formatUsd(stats.cost)}`, t("stats.cost"), "result-cost"),
      tile(num(stats.usage.input), t("stats.inputTokens")),
      tile(num(stats.usage.output), t("stats.outputTokens")),
      tile(num(stats.usage.searches), t("stats.searches")),
      tile(num(stats.calls), t("stats.calls")),
      ...(stats.refusedCalls > 0 ? [tile(num(stats.refusedCalls), t("stats.refused"))] : []),
      ...(metrics.largest > 0 ? [tile(num(metrics.largest), t("stats.largest"), "result-context")] : []),
      ...(metrics.notes > 0 ? [tile(num(metrics.notes), t("stats.notesTile"))] : []),
      ...(metrics.saved > 0 ? [tile(num(metrics.saved), t("stats.savedTile"))] : []),
      ...(loop ? [tile(t(`stats.loop.${{ accepted: "accepted", not_accepted: "notAccepted", stopped: "stopped" }[loop.result]}`, { n: loop.round, total: loop.rounds }), t("stats.loop"))] : []),
      ...(handPath ? [tile(String(handPath.length - 1), t("stats.handoffs"))] : []),
      ...(stats.guardrailHits > 0 ? [tile(num(stats.guardrailHits), t("stats.guardrailHits"))] : []),
      ...(stats.formatRepairs > 0 ? [tile(num(stats.formatRepairs), t("stats.formatRepairs"))] : []),
      ...(stats.refusedHandoffs > 0 ? [tile(num(stats.refusedHandoffs), t("stats.refusedHandoffs"))] : []),
      ...(routedChoice ? [tile(designLabel(handDesign, routedChoice.to), t("stats.routedTo"))] : []),
      ...(dynEnd ? [tile(dynEnd.kind === "mapreduce" ? num(dynEnd.total) : t("stats.planValue", { done: dynEnd.done, total: dynEnd.total }), t(dynEnd.kind === "mapreduce" ? "stats.parts" : "stats.planSteps"))] : []),
      ...(votedTally ? [tile(t("stats.votesValue", { votes: votedTally.votes, total: votedTally.total }), t("stats.votes"))] : []),
    );
    const table = h(
      doc,
      "table",
      { class: "result-table stats-table", "data-ui": "stats-agents" },
      h(
        doc,
        "thead",
        {},
        h(doc, "tr", {}, ...["stats.agent", "stats.model", "stats.agentTime", "stats.input", "stats.output", ...(stats.refusedCalls > 0 ? ["stats.refusedShort"] : []), "stats.share"].map((key) => h(doc, "th", { scope: "col" }, t(key)))),
      ),
      h(
        doc,
        "tbody",
        {},
        ...stats.perAgent.map((a) => {
          const pct = Math.round(a.share * 100);
          const bar = h(doc, "span", { class: "share-bar", role: "img", "aria-label": `${pct} %` }, h(doc, "i", { class: `w${Math.round(pct / 5) * 5}` }));
          const modelCell = h(doc, "span", { class: "badge agent-model" }, a.model || "—");
          paintModelTag(modelCell, a.model, ctx.settings?.get().providerColors);
          return h(
            doc,
            "tr",
            {},
            h(doc, "th", { scope: "row" }, a.label),
            h(doc, "td", {}, modelCell),
            h(doc, "td", {}, a.ms === null ? "—" : formatDuration(a.ms)),
            h(doc, "td", {}, num(a.input)),
            h(doc, "td", {}, num(a.output)),
            ...(stats.refusedCalls > 0 ? [h(doc, "td", {}, num(a.refused))] : []),
            h(doc, "td", {}, bar),
          );
        }),
      ),
    );
    // What each agent used of its limits (and the run of its own).
    const used = (c) => {
      if (c === undefined) return h(doc, "td", {}, "—");
      const pct = c.limit ? Math.min(100, Math.round((c.used / c.limit) * 100)) : 0;
      const text = c.limit === null ? num(c.used ?? 0) : `${num(c.used ?? 0)} / ${num(c.limit)}`;
      const source = c.limit === null ? "" : h(doc, "span", { class: "limit-source" }, ` (${t(c.from === "agent" ? "stats.limits.ofAgent" : "stats.limits.ofRun")})`);
      const bar = c.limit ? h(doc, "span", { class: `share-bar limit-bar${c.hit ? " hot" : ""}`, role: "img", "aria-label": `${pct} %` }, h(doc, "i", { class: `w${Math.round(pct / 5) * 5}` })) : "";
      return h(doc, "td", { class: c.hit ? "limit-hit" : "" }, h(doc, "span", {}, text), source, c.hit ? h(doc, "span", { class: "limit-reached" }, ` · ${t("stats.limits.reached")}`) : "", bar);
    };
    const hasCost = limitRows(stats)[0]?.cells.cost !== undefined;
    const money = (c) => h(doc, "td", { class: c.hit ? "limit-hit" : "" }, h(doc, "span", {}, `$${c.used.toFixed(2)} / $${c.limit.toFixed(2)}`), c.hit ? h(doc, "span", { class: "limit-reached" }, ` · ${t("stats.limits.reached")}`) : "", h(doc, "span", { class: `share-bar limit-bar${c.hit ? " hot" : ""}`, role: "img", "aria-label": `${Math.min(100, Math.round((c.used / c.limit) * 100))} %` }, h(doc, "i", { class: `w${Math.round(Math.min(100, (c.used / c.limit) * 100) / 5) * 5}` })));
    const limitTable = h(
      doc,
      "table",
      { class: "result-table stats-table limits-table", "data-ui": "stats-limits" },
      h(doc, "thead", {}, h(doc, "tr", {}, ...["stats.limits.agent", "stats.limits.steps", "stats.limits.tokens", "stats.limits.searches", "stats.limits.time", ...(hasCost ? ["stats.limits.cost"] : [])].map((key) => h(doc, "th", { scope: "col" }, t(key))))),
      h(
        doc,
        "tbody",
        {},
        ...limitRows(stats).map((row) => h(doc, "tr", { "data-ui": `limits-row-${row.id}` }, h(doc, "th", { scope: "row" }, row.id === "run" ? t("stats.limits.run") : row.label, row.id !== "run" && !row.own ? h(doc, "span", { class: "limit-source" }, ` · ${t("stats.limits.none")}`) : ""), used(row.cells.steps), used(row.cells.tokens), used(row.cells.searches), row.cells.time ? h(doc, "td", {}, row.cells.time.used === null ? "—" : `${num(row.cells.time.used)} / ${num(row.cells.time.limit)} s`) : h(doc, "td", {}, "—"), ...(hasCost ? [row.cells.cost ? money(row.cells.cost) : h(doc, "td", {}, "—")] : []))),
      ),
    );
    const limitsSection = stats.perAgent.length ? h(doc, "section", { class: "stats-limits", "data-ui": "stats-limits-section" }, h(doc, "h3", {}, t("stats.limits.title"), help("result-limits", t("stats.limits.title"))), h(doc, "p", { class: "hint" }, t("stats.limits.intro")), limitTable) : "";
    const when = [];
    if (stats.startedAt) when.push(t("stats.started", { time: formatWhen(stats.startedAt, ctx.lang) }));
    if (stats.endedAt) when.push(t("stats.ended", { time: formatWhen(stats.endedAt, ctx.lang) }));
    if (stats.appVersion) when.push(t("stats.appVersion", { version: stats.appVersion }));
    return h(
      doc,
      "div",
      { class: "stats-wrap" },
      tiles,
      contextChart({ doc, t, points: contextPerCall(run.events), num, help: help("result-context", t("stats.contextPerCall")) }) ?? "",
      ...(handPath ? [handoffPathView({ doc, t, design: handDesign, path: handPath })] : []),
      ...(routedChoice && routedChoice.reason ? [h(doc, "p", { class: "hint", "data-ui": "router-reason" }, routedChoice.reason)] : []),
      ...(votedTally && votedTally.note ? [h(doc, "p", { class: "hint", "data-ui": "voting-note" }, votedTally.note)] : []),
      stats.perAgent.length ? h(doc, "h3", {}, t("result.perAgent"), help("result-agents", t("result.perAgent"))) : "",
      stats.perAgent.length ? table : "",
      ...(stats.created.length > 0
        ? [
            h(doc, "h3", {}, t("stats.created.heading")),
            h(
              doc,
              "table",
              { class: "result-table stats-table", "data-ui": "stats-created" },
              h(doc, "thead", {}, h(doc, "tr", {}, ...["agent", "by", "at", "calls", "tokens", "cost"].map((key) => h(doc, "th", { scope: "col" }, t(`stats.created.${key}`))))),
              h(
                doc,
                "tbody",
                {},
                ...stats.created.map((c) =>
                  h(doc, "tr", {}, h(doc, "th", { scope: "row" }, c.name), h(doc, "td", {}, stats.perAgent.find((a) => a.agent === c.by)?.label ?? c.by), h(doc, "td", {}, num(c.step)), h(doc, "td", {}, num(c.calls)), h(doc, "td", {}, `${num(c.input)} / ${num(c.output)}`), h(doc, "td", {}, c.cost === 0 ? "—" : `$${formatUsd(c.cost)}`)),
                ),
              ),
            ),
          ]
        : []),
      limitsSection,
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
