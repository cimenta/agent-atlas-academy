// The Help page: the help text is split into topics at its "## " headings. The topics are listed on the left,
// one is shown on the right, and the search next to the title looks in all of them.
import { h } from "./dom.js";
import { parseMarkdown } from "./markdown.js";
import { renderBlocks } from "./render.js";
import { setTitle } from "./pages.js";
import { markText, findMatches } from "./text-search.js";
import { splitTopics } from "./help-topics.js";

export { splitTopics };

// The topics whose title or text contains the query (all of them when the query is empty).
export function filterTopics(topics, query) {
  const q = String(query ?? "").trim();
  if (!q) return topics;
  return topics.filter((topic) => findMatches(topic.title, q).length > 0 || findMatches(topic.text, q).length > 0);
}

export function renderHelp(ctx, topicId) {
  const { doc, t } = ctx;
  setTitle(ctx, t("help.title"));
  const topics = splitTopics(t("help.body"));
  // An address may name a topic, or one section of a topic: then that topic opens and the section is marked.
  const sectionTopic = topics.findIndex((topic) => topic.sections.some((section) => section.id === topicId));
  const state = { query: "", index: Math.max(0, sectionTopic >= 0 ? sectionTopic : topics.findIndex((topic) => topic.id === topicId)), section: sectionTopic >= 0 ? topicId : null };

  const search = h(doc, "input", { class: "learn-search", type: "search", "data-ui": "help-search", placeholder: t("help.search"), "aria-label": t("help.search"), autocomplete: "off" });
  const side = h(doc, "div", { class: "learn-side", "data-ui": "help-topics", role: "group", "aria-label": t("help.topics") });
  const main = h(doc, "div", { class: "learn-main help-main", "data-ui": "help-content" });

  const topicNode = (topic) => {
    const node = h(doc, "section", { class: "help-topic" }, h(doc, "h2", {}, topic.title), renderBlocks(parseMarkdown(topic.text), doc));
    // Every section heading knows its id, so a link or a ? button can point at it.
    for (const heading of node.querySelectorAll("h3")) {
      const section = topic.sections.find((s) => s.title === heading.textContent);
      if (section) heading.setAttribute("data-section", section.id);
    }
    return node;
  };

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
          state.section = null;
          state.query = "";
          search.value = "";
          draw();
        });
        // The open topic lists its sections under it; one of them jumps to it.
        const subs = on
          ? topic.sections.map((section) => {
              const sub = h(doc, "button", { type: "button", class: `learn-section help-sub${state.section === section.id ? " on" : ""}`, "data-section": section.id }, section.title);
              sub.addEventListener("click", () => {
                state.section = section.id;
                draw();
              });
              return sub;
            })
          : [];
        return [button, ...subs];
      }).flat(),
    );
    if (query) {
      main.replaceChildren(...(shown.length ? shown.map(topicNode) : [h(doc, "p", { class: "learn-note" }, t("help.noResults"))]));
      markText(doc, main, query);
    } else {
      main.replaceChildren(topicNode(topics[state.index] ?? topics[0] ?? { title: "", text: "", sections: [] }));
      const target = state.section ? main.querySelector(`[data-section="${state.section}"]`) : null;
      if (target) {
        target.classList.add("help-target");
        target.scrollIntoView?.({ block: "start" });
      }
    }
  }

  search.addEventListener("input", () => {
    state.query = search.value;
    draw();
  });
  draw();
  ctx.main.replaceChildren(h(doc, "div", { class: "help-head" }, h(doc, "h1", {}, t("help.title")), search), h(doc, "div", { class: "learn-cols" }, side, main));
}
