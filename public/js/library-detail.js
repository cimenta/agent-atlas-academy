// The detail of a run in the Library: who it is, what it is about, how it works, what the student learns, what to watch for,
// its settings and the articles that explain it. Pure drawing: the texts come from the detail file of the run, the facts from the run.
import { h } from "./dom.js";
import { AGENT_TYPES, providerCatalog } from "./engine/catalog.js";

const nameOf = (node) => node.name || AGENT_TYPES[node.agent]?.label || node.id;

// The design as small boxes: one path when the agents form a chain, otherwise one line per arrow, or the agents alone.
function diagram(doc, design) {
  const nodes = Array.isArray(design?.nodes) ? design.nodes : [];
  const edges = Array.isArray(design?.edges) ? design.edges : [];
  const box = (id) => h(doc, "b", {}, nameOf(nodes.find((n) => n.id === id) ?? { id }));
  const arrow = () => h(doc, "i", {}, "→");
  const line = (ids) => h(doc, "div", { class: "lib-diagram" }, ...ids.flatMap((id, i) => (i === 0 ? [box(id)] : [arrow(), box(id)])));
  if (nodes.length === 0) return [];
  if (edges.length === 0) return [h(doc, "div", { class: "lib-diagram" }, ...nodes.map((n) => box(n.id)))];
  const out = new Map();
  const into = new Map();
  for (const e of edges) {
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
    into.set(e.to, [...(into.get(e.to) ?? []), e.from]);
  }
  const chain = [...out.values()].every((v) => v.length === 1) && [...into.values()].every((v) => v.length === 1);
  if (chain) {
    const start = edges.find((e) => !into.has(e.from))?.from;
    if (start !== undefined) {
      const path = [start];
      while (out.has(path[path.length - 1]) && path.length <= nodes.length) path.push(out.get(path[path.length - 1])[0]);
      return [line(path)];
    }
  }
  return edges.map((e) => line([e.from, e.to]));
}

const section = (doc, t, key, ...content) => h(doc, "section", { "data-ui": `detail-${key}` }, h(doc, "h3", {}, t(`library.detail.${key}`)), ...content);
const paragraph = (doc, text) => h(doc, "p", {}, text);

// actions: [{ ui, label, primary?, danger?, onClick }]. aboutPanel: the description panel of your own run, shown as a section.
export function libraryDetail({ doc, t, item, run, source, detail, facts, actions = [], aboutPanel = null, num = (n) => String(n) }) {
  const text = (key) => (typeof detail?.[key] === "string" && detail[key].trim() !== "" ? detail[key] : "");
  const articles = Array.isArray(detail?.articles) ? detail.articles.filter((a) => a && typeof a.slug === "string" && /^[a-z0-9-]+$/.test(a.slug)) : [];
  const hasText = Boolean(text("about") || text("how") || text("learns") || text("watch") || articles.length > 0);

  const buttons = actions.map((a) => {
    const button = h(doc, "button", { type: "button", class: a.primary ? "primary" : a.danger ? "danger" : undefined, "data-ui": `detail-${a.ui}` }, a.label);
    button.addEventListener("click", () => a.onClick());
    return button;
  });

  const outcome = facts.outcome ? t(`result.status.${facts.outcome}`) : "";
  const sourceLabel = t(source === "local" ? "library.source.mine" : "library.source.library");
  const factsLine = t("library.facts", { outcome, source: sourceLabel, pattern: t(`pattern.${facts.pattern || item.pattern}`), language: String(facts.language || "").toUpperCase(), agents: facts.agents });

  const rows = facts.models.map((m) => h(doc, "tr", {}, h(doc, "td", {}, m.agent), h(doc, "td", {}, `${providerCatalog(m.provider).label} · ${m.model}`)));
  const limits = facts.limits ? t("library.settings.limits", { steps: num(facts.limits.maxSteps ?? 0), tokens: num(facts.limits.maxTokens ?? 0) }) : "";
  const apiLog = facts.hasApiLog ? t("library.settings.apiLog", { calls: num(facts.calls) }) : t("library.settings.noApiLog");

  const parts = [
    h(doc, "h2", {}, item.title),
    h(doc, "p", { class: "facts", "data-ui": "detail-facts" }, factsLine),
    h(doc, "div", { class: "actions", "data-ui": "detail-actions" }, ...buttons),
    ...(aboutPanel ? [section(doc, t, source === "local" ? "yours" : "authorNote", aboutPanel)] : []),
    ...(text("about") ? [section(doc, t, "about", paragraph(doc, text("about")))] : []),
    ...(text("how") || run?.design ? [section(doc, t, "how", ...diagram(doc, run?.design), ...(text("how") ? [paragraph(doc, text("how"))] : []))] : []),
    ...(text("learns") ? [section(doc, t, "learns", paragraph(doc, text("learns")))] : []),
    ...(text("watch") ? [section(doc, t, "watch", paragraph(doc, text("watch")))] : []),
    section(doc, t, "settings", h(doc, "table", { class: "detail-table" }, h(doc, "tr", {}, h(doc, "th", {}, t("library.settings.agent")), h(doc, "th", {}, t("library.settings.model"))), ...rows), h(doc, "p", { class: "facts" }, [limits, apiLog].filter(Boolean).join(" "))),
    ...(articles.length > 0 ? [section(doc, t, "articles", h(doc, "p", {}, ...articles.flatMap((a, i) => [...(i > 0 ? [" · "] : []), h(doc, "a", { href: `#/learn/${a.slug}` }, typeof a.title === "string" && a.title ? a.title : a.slug)])))] : []),
    ...(hasText || aboutPanel ? [] : [h(doc, "p", { class: "hint", "data-ui": "detail-no-text" }, t("library.detail.noText"))]),
  ];
  return h(doc, "div", { class: "library-detail", "data-ui": "library-detail" }, ...parts);
}
