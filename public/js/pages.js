import { h } from "./dom.js";
import { parseMarkdown } from "./markdown.js";
import { renderBlocks } from "./render.js";
import { SECTION_ORDER, loadArticle, loadArticleIndex, loadPage } from "./content.js";
import { mountReplay } from "./replay/view.js";

const RUN_ID = /^[a-z0-9-]+$/;

const markdown = (ctx, text) => renderBlocks(parseMarkdown(text), ctx.doc);
const show = (ctx, ...nodes) => ctx.main.replaceChildren(...nodes);

export function setTitle(ctx, title) {
  ctx.doc.title = title ? `${title} · ${ctx.t("site.name")}` : ctx.t("site.name");
}

export async function getJson(ctx, url) {
  const response = await ctx.fetchFn(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response.json();
}

export async function loadExplanations(ctx, id) {
  for (const lang of [ctx.lang, "en"]) {
    try {
      return await getJson(ctx, `/runs/${id}.explanations.${lang}.json`);
    } catch {
      // try the next language
    }
  }
  return {};
}

export function renderNotFound(ctx) {
  const { doc, t } = ctx;
  setTitle(ctx, t("error.notFound"));
  show(
    ctx,
    h(doc, "h1", {}, t("error.notFound")),
    h(doc, "p", {}, t("error.notFoundBody")),
    h(doc, "p", {}, h(doc, "a", { href: "#/" }, t("error.goHome"))),
  );
}

// The home page: a simple run that plays by itself, and what the site is about. Nothing else.
export async function renderLanding(ctx) {
  const { doc, t } = ctx;
  setTitle(ctx, "");
  const host = h(doc, "div", { class: "replay-host", "data-ui": "home-player" });
  const about = h(doc, "div", { class: "landing-body", "data-ui": "home-about" }, markdown(ctx, t("landing.body")));
  show(ctx, h(doc, "h1", {}, t("landing.title")), h(doc, "p", { class: "lead" }, t("landing.intro")), host, about);
  try {
    const index = await getJson(ctx, "/runs/index.json");
    const first = index.runs[0];
    if (!first || !RUN_ID.test(first.id)) throw new Error("no run");
    const run = await getJson(ctx, `/runs/${first.id}.json`);
    const explanations = await loadExplanations(ctx, first.id);
    if (ctx.isStale()) return;
    const handle = mountReplay(host, { run, explanations, t, doc, autoStart: ctx.autoStart, timeScale: first.timeScale });
    ctx.onLeave(handle.destroy);
  } catch {
    if (!ctx.isStale()) host.replaceChildren(h(doc, "p", { class: "notice", role: "alert" }, t("error.loadFailed")));
  }
}

export async function renderLearn(ctx) {
  const { doc, t } = ctx;
  setTitle(ctx, t("learn.title"));
  const { items, fallbackSlugs } = await loadArticleIndex(ctx.lang, ctx.fetchFn);
  if (ctx.isStale()) return;
  const nodes = [h(doc, "h1", {}, t("learn.title")), h(doc, "p", {}, t("learn.intro"))];
  if (items.length === 0) nodes.push(h(doc, "p", { class: "notice", role: "alert" }, t("error.loadFailed")));
  for (const section of SECTION_ORDER) {
    const inSection = items.filter((item) => item.section === section);
    if (inSection.length === 0) continue;
    const list = h(doc, "ul", { class: "learn-list" });
    for (const item of inSection) {
      const entry = h(
        doc,
        "li",
        {},
        h(doc, "a", { href: `#/learn/${item.slug}` }, item.title),
        h(doc, "span", { class: "summary" }, ` ${item.summary}`),
      );
      if (fallbackSlugs.has(item.slug)) entry.append(h(doc, "span", { class: "tag" }, ` (${t("lang.en")})`));
      list.append(entry);
    }
    nodes.push(h(doc, "h2", {}, t(`learn.section.${section}`)), list);
  }
  show(ctx, ...nodes);
}

export async function renderArticle(ctx, slug) {
  const { doc, t } = ctx;
  const article = await loadArticle(ctx.lang, slug, ctx.fetchFn);
  if (ctx.isStale()) return;
  if (!article) return renderNotFound(ctx);
  const title = article.meta.title || slug;
  setTitle(ctx, title);
  const nodes = [h(doc, "p", {}, h(doc, "a", { href: "#/learn" }, `← ${t("learn.back")}`)), h(doc, "h1", {}, title)];
  if (article.isFallback) nodes.push(h(doc, "p", { class: "notice" }, t("learn.fallbackNotice")));
  nodes.push(h(doc, "article", { class: "article" }, renderBlocks(article.blocks, doc)));
  const related = Array.isArray(article.meta.related) ? article.meta.related : [];
  if (related.length > 0) {
    const { items } = await loadArticleIndex(ctx.lang, ctx.fetchFn);
    const titles = new Map(items.map((item) => [item.slug, item.title]));
    const list = h(doc, "ul", {});
    for (const rel of related.filter((r) => titles.has(r))) {
      list.append(h(doc, "li", {}, h(doc, "a", { href: `#/learn/${rel}` }, titles.get(rel))));
    }
    if (list.children.length > 0) nodes.push(h(doc, "h2", {}, t("learn.related")), list);
  }
  if (ctx.isStale()) return;
  show(ctx, ...nodes);
}

export function renderTextPage(ctx, titleKey, bodyKey) {
  const { doc, t } = ctx;
  setTitle(ctx, t(titleKey));
  const nodes = [h(doc, "h1", {}, t(titleKey)), markdown(ctx, t(bodyKey))];
  show(ctx, ...nodes);
}

export async function renderLegalPage(ctx, name) {
  const { doc, t } = ctx;
  const page = await loadPage(ctx.lang, name, ctx.fetchFn);
  if (ctx.isStale()) return;
  if (!page) return renderNotFound(ctx);
  const title = page.meta.title || t(`page.${name}`);
  setTitle(ctx, title);
  const nodes = [h(doc, "h1", {}, title)];
  if (page.isFallback) nodes.push(h(doc, "p", { class: "notice" }, t("learn.fallbackNotice")));
  nodes.push(h(doc, "article", { class: "article" }, renderBlocks(page.blocks, doc)));
  show(ctx, ...nodes);
}
