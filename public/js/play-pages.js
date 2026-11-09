// The Play section: sub-tabs Re-play, Create and Result.
import { h } from "./dom.js";
import { mountReplay } from "./replay/view.js";
import { getJson, loadExplanations, renderLanding, renderNotFound, setTitle } from "./pages.js";
import { buildReplayList, buildResultModel } from "./play-model.js";
import { renderCreate } from "./create/create-page.js";

const TABS = [
  { view: "replay", href: "#/play", key: "play.tab.replay" },
  { view: "create", href: "#/play/create", key: "play.tab.create" },
  { view: "result", href: "#/play/result", key: "play.tab.result" },
];
const TAB_OF_VIEW = { replay: "replay", run: "replay", create: "create", result: "result" };

function tabBar(ctx, view) {
  const { doc, t } = ctx;
  const active = TAB_OF_VIEW[view] ?? "replay";
  return h(
    doc,
    "nav",
    { class: "subtabs", "aria-label": t("play.tabs") },
    ...TABS.map((tab) => h(doc, "a", { href: tab.href, "aria-current": tab.view === active ? "page" : undefined }, t(tab.key))),
  );
}

// Draws the tab bar and a content area, then fills the content area.
export async function renderPlay(ctx, route = { params: { view: "replay" } }) {
  const view = route.view ?? route.params?.view ?? "replay";
  const id = route.id ?? route.params?.id;
  const content = h(ctx.doc, "div", { class: "play-content" });
  ctx.main.replaceChildren(tabBar(ctx, view), content);
  const inner = { ...ctx, main: content };
  switch (view) {
    case "create":
      return renderCreate(inner);
    case "result":
      return renderResultTab(inner, id);
    case "run":
      return renderRunView(inner, id);
    default:
      return renderReplayTab(inner);
  }
}

function runRow(ctx, item, onDelete) {
  const { doc, t } = ctx;
  const parts = [t(`pattern.${item.pattern}`)];
  if (item.outcome) parts.push(t(`result.status.${item.outcome}`));
  const row = h(
    doc,
    "li",
    { class: "run-row" },
    h(doc, "a", { href: `#/play/run/${item.id}`, class: "run-title" }, item.title),
    h(doc, "span", { class: "run-meta" }, parts.join(" · ")),
  );
  if (onDelete) {
    const button = h(doc, "button", { type: "button", "aria-label": t("play.deleteLabel", { title: item.title }) }, t("play.delete"));
    button.addEventListener("click", onDelete);
    row.append(button);
  }
  return row;
}

export async function renderReplayTab(ctx) {
  const { doc, t } = ctx;
  const landing = h(doc, "div", { class: "landing" });
  const lists = h(doc, "div", { class: "run-lists" });
  ctx.main.replaceChildren(landing, lists);
  await renderLanding({ ...ctx, main: landing });
  if (ctx.isStale()) return;

  let gallery = [];
  try {
    gallery = (await getJson(ctx, "/runs/index.json")).runs ?? [];
  } catch {
    gallery = [];
  }
  const draw = async () => {
    let local = [];
    try {
      local = await ctx.runStore.list();
    } catch {
      local = [];
    }
    if (ctx.isStale()) return;
    const { gallery: shown, mine } = buildReplayList(gallery, local);
    lists.replaceChildren(
      h(doc, "h2", {}, t("play.gallery")),
      h(doc, "ul", { class: "run-list" }, ...shown.map((item) => runRow(ctx, item))),
      h(doc, "h2", {}, t("play.mine")),
      mine.length === 0
        ? h(doc, "p", { class: "notice" }, t("play.empty"))
        : h(
            doc,
            "ul",
            { class: "run-list" },
            ...mine.map((item) =>
              runRow(ctx, item, async () => {
                await ctx.runStore.remove(item.id);
                await draw();
              }),
            ),
          ),
    );
  };
  await draw();
}

async function loadAnyRun(ctx, id) {
  if (typeof id !== "string") return null;
  try {
    const local = await ctx.runStore.get(id);
    if (local) return { run: local, source: "local" };
  } catch {
    // fall through to the examples
  }
  try {
    return { run: await getJson(ctx, `/runs/${id}.json`), source: "gallery" };
  } catch {
    return null;
  }
}

export async function renderRunView(ctx, id) {
  const { doc, t } = ctx;
  setTitle(ctx, "");
  const found = await loadAnyRun(ctx, id);
  if (ctx.isStale()) return;
  if (!found) {
    ctx.main.replaceChildren(h(doc, "p", { class: "notice", role: "alert" }, t("play.runNotFound")), h(doc, "p", {}, h(doc, "a", { href: "#/play" }, t("play.back"))));
    return;
  }
  const host = h(doc, "div", { class: "replay-host" });
  ctx.main.replaceChildren(
    h(doc, "p", {}, h(doc, "a", { href: "#/play" }, t("play.back")), " · ", h(doc, "a", { href: `#/play/result/${id}` }, t("play.tab.result"))),
    host,
  );
  const explanations = found.source === "gallery" ? await loadExplanations(ctx, id) : {};
  if (ctx.isStale()) return;
  const handle = mountReplay(host, { run: found.run, explanations, t, doc, autoStart: ctx.autoStart });
  ctx.onLeave(handle.destroy);
}

export async function renderResultTab(ctx, id) {
  const { doc, t } = ctx;
  let found = null;
  if (id) found = await loadAnyRun(ctx, id);
  else {
    try {
      const newest = (await ctx.runStore.list())[0];
      if (newest) found = await loadAnyRun(ctx, newest.id);
    } catch {
      found = null;
    }
  }
  if (ctx.isStale()) return;
  if (!found) {
    ctx.main.replaceChildren(h(doc, "p", { class: "notice" }, t(id ? "play.runNotFound" : "play.resultEmpty")));
    return;
  }
  const { run } = found;
  const model = buildResultModel(run);
  setTitle(ctx, t("result.title", { title: run.title }));
  const table = h(
    doc,
    "table",
    { class: "result-table" },
    h(doc, "thead", {}, h(doc, "tr", {}, h(doc, "th", { scope: "col" }, t("result.agent")), h(doc, "th", { scope: "col" }, t("result.in")), h(doc, "th", { scope: "col" }, t("result.out")))),
    h(
      doc,
      "tbody",
      {},
      ...model.perAgent.map((a) => h(doc, "tr", {}, h(doc, "th", { scope: "row" }, a.agent), h(doc, "td", {}, String(a.input)), h(doc, "td", {}, String(a.output)))),
    ),
  );
  const cost =
    model.cost === null
      ? h(doc, "p", {}, t("result.costUnknown"))
      : h(doc, "p", {}, t("result.costValue", { usd: model.cost.toFixed(4) }), " ", h(doc, "small", {}, t("result.costNote")));
  ctx.main.replaceChildren(
    h(doc, "h2", {}, t("result.title", { title: run.title })),
    h(doc, "p", {}, h(doc, "strong", {}, `${t("result.status")}: `), t(`result.status.${model.status}`)),
    h(doc, "h3", {}, t("result.finalText")),
    h(doc, "pre", { class: "message final-text" }, model.finalText || t("result.noText")),
    h(doc, "h3", {}, t("result.usage")),
    h(doc, "p", {}, t("result.usageLine", model.usage)),
    model.perAgent.length ? h(doc, "h3", {}, t("result.perAgent")) : "",
    model.perAgent.length ? table : "",
    h(doc, "h3", {}, t("result.cost")),
    cost,
    h(doc, "p", {}, h(doc, "a", { href: `#/play/run/${run.id}` }, t("result.watch"))),
  );
}

export { renderNotFound };
