// The Help page: the help text is split into topics at its "## " headings. The topics are listed on the left,
// one is shown on the right, and the search next to the title looks in all of them.
import { h } from "./dom.js";
import { parseMarkdown } from "./markdown.js";
import { renderBlocks } from "./render.js";
import { setTitle } from "./pages.js";
import { markText, findMatches } from "./text-search.js";

// [{ title, text }] from a markdown text whose topics start with "## title". Text before the first heading is dropped.
export function splitTopics(markdown) {
  const topics = [];
  for (const line of String(markdown ?? "").replace(/\r\n/g, "\n").split("\n")) {
    const heading = /^##\s+(.+?)\s*$/.exec(line);
    if (heading) topics.push({ title: heading[1], lines: [] });
    else if (topics.length > 0) topics[topics.length - 1].lines.push(line);
  }
  return topics.map(({ title, lines }) => ({ title, text: lines.join("\n").trim() }));
}

// The topics whose title or text contains the query (all of them when the query is empty).
export function filterTopics(topics, query) {
  const q = String(query ?? "").trim();
  if (!q) return topics;
  return topics.filter((topic) => findMatches(topic.title, q).length > 0 || findMatches(topic.text, q).length > 0);
}

export function renderHelp(ctx) {
  const { doc, t } = ctx;
  setTitle(ctx, t("help.title"));
  const topics = splitTopics(t("help.body"));
  const state = { query: "", index: 0 };

  const search = h(doc, "input", { class: "learn-search", type: "search", "data-ui": "help-search", placeholder: t("help.search"), "aria-label": t("help.search"), autocomplete: "off" });
  const side = h(doc, "div", { class: "learn-side", "data-ui": "help-topics", role: "group", "aria-label": t("help.topics") });
  const main = h(doc, "div", { class: "learn-main help-main", "data-ui": "help-content" });

  const topicNode = (topic) => h(doc, "section", { class: "help-topic" }, h(doc, "h2", {}, topic.title), renderBlocks(parseMarkdown(topic.text), doc));

  function draw() {
    const query = state.query.trim();
    const shown = filterTopics(topics, query);
    side.replaceChildren(
      ...shown.map((topic) => {
        const at = topics.indexOf(topic);
        const on = !query && at === state.index;
        const button = h(doc, "button", { type: "button", class: `learn-section${on ? " on" : ""}`, "data-topic": String(at), "aria-pressed": String(on) }, topic.title);
        button.addEventListener("click", () => {
          state.index = at;
          state.query = "";
          search.value = "";
          draw();
        });
        return button;
      }),
    );
    if (query) {
      main.replaceChildren(...(shown.length ? shown.map(topicNode) : [h(doc, "p", { class: "learn-note" }, t("help.noResults"))]));
      markText(doc, main, query);
    } else {
      main.replaceChildren(topicNode(topics[state.index] ?? topics[0] ?? { title: "", text: "" }));
    }
  }

  search.addEventListener("input", () => {
    state.query = search.value;
    draw();
  });
  draw();
  ctx.main.replaceChildren(h(doc, "div", { class: "help-head" }, h(doc, "h1", {}, t("help.title")), search), h(doc, "div", { class: "learn-cols" }, side, main));
}
