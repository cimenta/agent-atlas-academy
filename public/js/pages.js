import { h } from "./dom.js";
import { parseMarkdown } from "./markdown.js";
import { pickHomeRun } from "./play-model.js";
import { renderBlocks } from "./render.js";
import { SECTION_ORDER, loadArticle, loadArticleIndex, loadPage } from "./content.js";
import { mountReplay } from "./replay/view.js";
import { blocksToText, readingMinutes, searchArticles } from "./learn-search.js";
import { markText } from "./text-search.js";
import { createMiniReplay } from "./mini-replay.js";

const RUN_ID = /^[a-z0-9-]+$/;
const LOOP_WAIT_MS = 5000;

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

// The home page: what the site is about, and a simple run that plays by itself. Nothing else.
export async function renderLanding(ctx) {
  const { doc, t } = ctx;
  setTitle(ctx, "");
  const host = h(doc, "div", { class: "replay-host", "data-ui": "home-player" });
  const taskBar = h(doc, "p", { class: "home-task", "data-ui": "home-task", hidden: true });
  const about = h(
    doc,
    "section",
    { class: "about", "data-ui": "home-about" },
    h(
      doc,
      "div",
      { class: "about-cols", "data-ui": "home-about-boxes" },
      ...[["watch", "▶"], ["compare", "⇄"], ["try", "⚗"]].map(([key, icon]) =>
        h(doc, "div", { class: `about-box about-${key}` }, h(doc, "span", { class: "about-icon", "aria-hidden": "true" }, icon), h(doc, "b", {}, t(`landing.${key}.title`)), h(doc, "span", { class: "about-text" }, t(`landing.${key}.text`))),
      ),
    ),
  );
  // On a phone a small decorative replay sits above the headline (hidden on wide screens).
  const mini = createMiniReplay({ doc, t, h });
  ctx.onLeave(mini.destroy);
  show(ctx, mini.element, h(doc, "h1", {}, t("landing.title")), h(doc, "p", { class: "lead lead-wide" }, t("landing.intro")), about, taskBar, host);
  try {
    const index = await getJson(ctx, "/runs/index.json");
    const first = pickHomeRun(index.runs);
    if (!first || !RUN_ID.test(first.id)) throw new Error("no run");
    const run = await getJson(ctx, `/runs/${first.id}.json`);
    const explanations = await loadExplanations(ctx, first.id);
    if (ctx.isStale()) return;
    const task = run.events.find((e) => e.type === "run_start")?.task;
    if (typeof task === "string" && task) {
      taskBar.replaceChildren(h(doc, "span", { class: "lb" }, `${t("landing.task")}: `), task);
      taskBar.hidden = false;
    }
    const handle = mountReplay(host, { run, explanations, t, doc, autoStart: ctx.autoStart, timeScale: first.timeScale, layout: ctx.settings?.get().playerLayout });
    ctx.onLeave(handle.destroy);
    // The demo plays again by itself, a few seconds after it has finished.
    // Any click in the player (pause, restart, step, a box) means the visitor takes over: no more repeats.
    if (ctx.autoStart && handle.player) {
      let timer;
      let stopped = false;
      host.addEventListener?.("click", () => {
        stopped = true;
        clearTimeout(timer);
        timer = undefined;
      });
      const unsubscribe = handle.player.subscribe(() => {
        if (stopped || !handle.player.finished || timer) return;
        timer = setTimeout(() => {
          timer = undefined;
          if (!stopped && handle.player.finished) handle.player.play();
        }, LOOP_WAIT_MS);
      });
      ctx.onLeave(() => {
        clearTimeout(timer);
        unsubscribe();
      });
    }
  } catch {
    if (!ctx.isStale()) host.replaceChildren(h(doc, "p", { class: "notice", role: "alert" }, t("error.loadFailed")));
  }
}

export async function renderLearn(ctx) {
  const { doc, t } = ctx;
  setTitle(ctx, t("learn.title"));
  const { items, fallbackSlugs } = await loadArticleIndex(ctx.lang, ctx.fetchFn);
  if (ctx.isStale()) return;
  if (items.length === 0) {
    show(ctx, h(doc, "h1", {}, t("learn.title")), h(doc, "p", { class: "notice", role: "alert" }, t("error.loadFailed")));
    return;
  }
  const sections = SECTION_ORDER.filter((section) => items.some((item) => item.section === section));
  const state = { query: "", section: "all" };
  let texts = null;
  let loading = false;

  const search = h(doc, "input", { class: "learn-search", type: "search", "data-ui": "learn-search", placeholder: t("learn.search"), "aria-label": t("learn.search"), autocomplete: "off" });
  const side = h(doc, "div", { class: "learn-side", "data-ui": "learn-sections", role: "group", "aria-label": t("learn.sections") });
  const main = h(doc, "div", { class: "learn-main", "data-ui": "learn-results" });

  const row = (item, snippet) => {
    const entry = h(doc, "li", { class: "learn-row" }, h(doc, "a", { href: `#/learn/${item.slug}` }, item.title), h(doc, "span", { class: "summary" }, item.summary));
    if (snippet) entry.append(h(doc, "span", { class: "snippet" }, snippet));
    if (item.coming) entry.append(h(doc, "span", { class: "tag coming", "data-ui": "learn-coming" }, t("learn.coming")));
    if (fallbackSlugs.has(item.slug)) entry.append(h(doc, "span", { class: "tag" }, `(${t("lang.en")})`));
    return entry;
  };

  // Searching a word looks in every article, so the first letter typed loads the texts of all of them.
  async function loadTexts() {
    if (texts || loading) return;
    loading = true;
    const loaded = {};
    await Promise.all(
      items.map(async (item) => {
        try {
          const article = await loadArticle(ctx.lang, item.slug, ctx.fetchFn);
          if (article) loaded[item.slug] = blocksToText(article.blocks);
        } catch {
          // an article that does not load is searched by its title and summary only
        }
      }),
    );
    texts = loaded;
    loading = false;
    if (!ctx.isStale() && state.query.trim()) draw();
  }

  function draw() {
    const query = state.query.trim();
    side.replaceChildren(
      ...["all", ...sections].map((section) => {
        const count = section === "all" ? items.length : items.filter((item) => item.section === section).length;
        const label = section === "all" ? t("learn.all") : t(`learn.section.${section}`);
        const on = !query && state.section === section;
        const button = h(doc, "button", { type: "button", class: `learn-section${on ? " on" : ""}`, "data-section": section, "aria-pressed": String(on) }, label, h(doc, "span", { class: "count" }, String(count)));
        button.addEventListener("click", () => {
          state.section = section;
          search.value = "";
          state.query = "";
          draw();
        });
        return button;
      }),
    );
    let list;
    let note = "";
    if (query) {
      const found = searchArticles(items, texts, query);
      note = found.length ? t("learn.results", { n: found.length }) : t("learn.noResults");
      list = h(doc, "ul", { class: "learn-list" }, ...found.map(({ item, snippet }) => row(item, snippet)));
    } else {
      const shown = state.section === "all" ? items : items.filter((item) => item.section === state.section);
      list = h(doc, "ul", { class: "learn-list" }, ...shown.map((item) => row(item, "")));
    }
    main.replaceChildren(...(note ? [h(doc, "p", { class: "learn-note", "aria-live": "polite" }, note)] : []), list);
    if (query) markText(doc, list, query);
  }

  search.addEventListener("input", () => {
    state.query = search.value;
    if (state.query.trim()) loadTexts();
    draw();
  });
  draw();
  show(ctx, h(doc, "h1", {}, t("learn.title")), search, h(doc, "div", { class: "learn-cols" }, side, main));
}

export async function renderArticle(ctx, slug) {
  const { doc, t } = ctx;
  const article = await loadArticle(ctx.lang, slug, ctx.fetchFn);
  if (ctx.isStale()) return;
  if (!article) return renderNotFound(ctx);
  const { items } = await loadArticleIndex(ctx.lang, ctx.fetchFn);
  if (ctx.isStale()) return;
  const title = article.meta.title || slug;
  setTitle(ctx, title);
  const current = items.find((item) => item.slug === slug);
  const section = current?.section ?? article.meta.section;
  const summary = current?.summary || article.meta.summary || "";
  const sectionName = section && SECTION_ORDER.includes(section) ? t(`learn.section.${section}`) : "";

  // The section (a link back to Learn) and the reading time sit above the title; the summary is a box under it.
  const meta = h(doc, "p", { class: "article-meta", "data-ui": "article-meta" });
  if (sectionName) meta.append(h(doc, "a", { class: "art-pill", href: "#/learn", title: t("learn.back") }, sectionName));
  meta.append(h(doc, "span", { class: "art-pill art-pill-muted" }, t("learn.readTime", { n: readingMinutes(article.blocks) })));
  const nodes = [meta, h(doc, "h1", {}, title)];
  if (summary) nodes.push(h(doc, "p", { class: "article-lead", "data-ui": "article-lead" }, h(doc, "b", {}, t("learn.inShort")), ` ${summary}`));
  if (article.meta?.coming === "true") nodes.push(h(doc, "p", { class: "notice coming", "data-ui": "learn-coming-notice" }, t("learn.comingNotice")));
  if (article.isFallback) nodes.push(h(doc, "p", { class: "notice" }, t("learn.fallbackNotice")));
  nodes.push(h(doc, "article", { class: "article" }, renderBlocks(article.blocks, doc)));

  const bySlug = new Map(items.map((item) => [item.slug, item]));
  const related = (Array.isArray(article.meta.related) ? article.meta.related : []).filter((r) => bySlug.has(r));
  if (related.length > 0) {
    nodes.push(
      h(doc, "h2", {}, t("learn.related")),
      h(
        doc,
        "div",
        { class: "rel-cards", "data-ui": "related-articles" },
        ...related.map((rel) => h(doc, "a", { class: "rel-card", href: `#/learn/${rel}` }, h(doc, "b", {}, bySlug.get(rel).title), h(doc, "span", {}, bySlug.get(rel).summary ?? ""))),
      ),
    );
  }
  // The articles before and after this one in its section.
  const inSection = items.filter((item) => item.section === section);
  const at = inSection.findIndex((item) => item.slug === slug);
  if (at >= 0 && inSection.length > 1) {
    const before = inSection[at - 1];
    const after = inSection[at + 1];
    nodes.push(
      h(
        doc,
        "nav",
        { class: "article-nav", "data-ui": "article-nav", "aria-label": t("learn.sections") },
        before ? h(doc, "a", { href: `#/learn/${before.slug}`, class: "prev" }, `\u2190 ${before.title}`) : h(doc, "span", {}),
        after ? h(doc, "a", { href: `#/learn/${after.slug}`, class: "next" }, `${after.title} \u2192`) : h(doc, "span", {}),
      ),
    );
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
