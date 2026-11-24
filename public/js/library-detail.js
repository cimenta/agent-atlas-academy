// The detail of a run in the Library: who it is, what it is about, how it works, what the student learns, what to watch for,
// its settings and the articles that explain it. Pure drawing: the texts come from the detail file of the run, the facts from the run.
import { h } from "./dom.js";
import { AGENT_TYPES, providerCatalog } from "./engine/catalog.js";
import { groupOfTag } from "./library-tags.js";

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

const ACTION_ICONS = {
  load: ["M5 3l8 5-8 5z"],
  "use-in-create": ["M5 7.3l6-3M5 8.7l6 3"],
  export: ["M8 10V2M4.5 5 8 1.5 11.5 5M3 10v3h10v-3"],
  compare: ["M2 5h10M9 2l3 3-3 3M14 11H4M7 8l-3 3 3 3"],
  send: ["M2 8 14 2l-3 12-3-5z"],
  "edit-description": ["M2 14h3l8-8-3-3-8 8zM9 4l3 3"],
  delete: ["M3 4h10M6 4V2h4v2M5 4l.7 9h4.6L11 4"],
};
function actionIcon(doc, paths) {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", class: "action-icon" })) svg.setAttribute(k, v);
  for (const d of paths) {
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.append(path);
  }
  if (paths === ACTION_ICONS["use-in-create"]) {
    for (const [cx, cy] of [[3.5, 8], [12.5, 3.5], [12.5, 12.5]]) {
      const dot = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", "1.6");
      svg.append(dot);
    }
  }
  return svg;
}

// The two time chips: a stopwatch (how long the recorded run took) and a cap (an estimate of the study time).
const TIME_ICONS = {
  run: ["M8 9V6M6.5 1.8h3M12.2 3.6l.8-.8"],
  study: ["M1.5 4.5 8 2l6.5 2.5L8 7zM4 6.2v3.3c0 1 1.8 2 4 2s4-1 4-2V6.2"],
};
function timeIcon(doc, kind) {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  for (const [k, v] of Object.entries({ viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round" })) svg.setAttribute(k, v);
  if (kind === "run") {
    const c = doc.createElementNS("http://www.w3.org/2000/svg", "circle");
    for (const [k, v] of Object.entries({ cx: "8", cy: "9", r: "5.2" })) c.setAttribute(k, v);
    svg.append(c);
  }
  for (const d of TIME_ICONS[kind]) {
    const p = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", d);
    svg.append(p);
  }
  return svg;
}

// 45 s, or 2 min 05 s from 90 s on.
export function formatRunTime(seconds) {
  const s = Math.round(seconds);
  return s < 90 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`;
}

// actions: [{ ui, label, primary?, danger?, onClick }]. tagLabel(tag): the word of a tag in the language of the page. aboutPanel: the description panel of your own run, shown as a section.
export function libraryDetail({ doc, t, item, run, source, detail, facts, actions = [], aboutPanel = null, num = (n) => String(n), tagLabel = (tag) => tag }) {
  const text = (key) => (typeof detail?.[key] === "string" && detail[key].trim() !== "" ? detail[key] : "");
  const articles = Array.isArray(detail?.articles) ? detail.articles.filter((a) => a && typeof a.slug === "string" && /^[a-z0-9-]+$/.test(a.slug)) : [];
  const tags = Array.isArray(item?.tags) ? item.tags.filter((x) => typeof x === "string" && x !== "") : [];
  const hasText = Boolean(text("about") || text("how") || text("learns") || text("watch") || articles.length > 0);

  // Small buttons: Load keeps its words, the others are icons with the name and what they do as a tooltip.
  const buttons = [...actions.filter((a) => a.ui !== "delete"), ...actions.filter((a) => a.ui === "delete")].flatMap((a) => {
    const iconOnly = !a.primary;
    const cls = ["action", iconOnly ? "icon" : "", a.primary ? "primary" : a.danger ? "danger" : ""].filter(Boolean).join(" ");
    const tip = t(`library.tip.action.${a.ui}`);
    const button = h(doc, "button", { type: "button", class: cls, "data-ui": `detail-${a.ui}`, title: tip.startsWith("library.tip.") ? a.label : `${a.label}: ${tip}`, ...(iconOnly ? { "aria-label": a.label } : {}) }, ...(ACTION_ICONS[a.ui] ? [actionIcon(doc, ACTION_ICONS[a.ui])] : []), ...(iconOnly ? [] : [a.label]));
    button.addEventListener("click", () => a.onClick());
    return a.ui === "edit-description" ? [h(doc, "span", { class: "action-sep", "aria-hidden": "true" }), button] : [button];
  });

  const outcome = facts.outcome ? t(`result.status.${facts.outcome}`) : "";
  const sourceLabel = t(source === "local" ? "library.source.mine" : "library.source.library");
  const factsLine = t("library.facts", { outcome, source: sourceLabel, pattern: t(`pattern.${facts.pattern || item.pattern}`), language: String(facts.language || "").toUpperCase(), agents: facts.agents });

  const rows = facts.models.map((m) => h(doc, "tr", {}, h(doc, "td", {}, m.agent), h(doc, "td", {}, `${providerCatalog(m.provider).label} · ${m.model}`)));
  const limits = facts.limits ? t("library.settings.limits", { steps: num(facts.limits.maxSteps ?? 0), tokens: num(facts.limits.maxTokens ?? 0) }) : "";
  const apiLog = facts.hasApiLog ? t("library.settings.apiLog", { calls: num(facts.calls) }) : t("library.settings.noApiLog");

  const runSeconds = Number.isFinite(facts.seconds) && facts.seconds > 0 ? facts.seconds : 0;
  const studyMinutes = Number.isFinite(item?.studyMinutes) && item.studyMinutes > 0 ? item.studyMinutes : 0;
  const chip = (kind, tip, label) => h(doc, "span", { class: "time-chip", "data-ui": `detail-time-${kind}`, title: tip, "aria-label": `${tip}: ${label}` }, timeIcon(doc, kind), h(doc, "b", {}, label));
  const timeChips = [
    ...(runSeconds > 0 ? [chip("run", t("library.detail.runTime"), formatRunTime(runSeconds))] : []),
    ...(studyMinutes > 0 ? [chip("study", t("library.detail.studyTime"), t("library.detail.studyAbout", { minutes: num(Math.round(studyMinutes)) }))] : []),
  ];
  const tagWords = tags.map((tag) => h(doc, "span", { class: `tag-word tag-${groupOfTag(tag)}`, "data-ui": "detail-tag" }, tagLabel(tag)));

  // Three tabs: what it is about, the settings, and the note about the pattern (or your own note on your run).
  const aboutPane = [
    ...(text("about") ? [section(doc, t, "about", paragraph(doc, text("about")))] : []),
    ...(text("how") || run?.design ? [section(doc, t, "how", ...diagram(doc, run?.design), ...(text("how") ? [paragraph(doc, text("how"))] : []))] : []),
    ...(text("watch") ? [section(doc, t, "watch", paragraph(doc, text("watch")))] : []),
    ...(articles.length > 0 ? [section(doc, t, "articles", h(doc, "p", {}, ...articles.flatMap((a, i) => [...(i > 0 ? [" · "] : []), h(doc, "a", { href: `#/learn/${a.slug}` }, typeof a.title === "string" && a.title ? a.title : a.slug)])))] : []),
    ...(hasText || aboutPanel ? [] : [h(doc, "p", { class: "hint", "data-ui": "detail-no-text" }, t("library.detail.noText"))]),
  ];
  const settingsPane = [section(doc, t, "settings", h(doc, "table", { class: "detail-table" }, h(doc, "tr", {}, h(doc, "th", {}, t("library.settings.agent")), h(doc, "th", {}, t("library.settings.model"))), ...rows), h(doc, "p", { class: "facts" }, [limits, apiLog].filter(Boolean).join(" ")))];
  const tabList = [
    { name: "about", label: t("library.tab.about"), content: aboutPane },
    { name: "settings", label: t("library.tab.settings"), content: settingsPane },
    ...(aboutPanel ? [{ name: "pattern", label: t(source === "local" ? "library.tab.thisRun" : "library.tab.pattern"), content: [aboutPanel] }] : []),
  ];
  const panes = tabList.map((tab, i) => h(doc, "div", { class: "detail-pane", role: "tabpanel", "data-ui": `detail-pane-${tab.name}`, hidden: i !== 0 }, ...tab.content));
  const buttonsOfTabs = tabList.map((tab, i) => h(doc, "button", { type: "button", class: "tab", role: "tab", "data-ui": `detail-tab-${tab.name}`, "aria-selected": String(i === 0), tabindex: i === 0 ? "0" : "-1" }, tab.label));
  buttonsOfTabs.forEach((button, i) => button.addEventListener("click", () => {
    buttonsOfTabs.forEach((b, j) => {
      b.setAttribute("aria-selected", String(i === j));
      b.setAttribute("tabindex", i === j ? "0" : "-1");
      panes[j].hidden = i !== j;
    });
  }));

  const parts = [
    h(doc, "h2", {}, item.title),
    h(doc, "p", { class: "facts", "data-ui": "detail-facts" }, factsLine),
    ...(timeChips.length > 0 || tagWords.length > 0 ? [h(doc, "div", { class: "detail-meta", "data-ui": "detail-meta" }, ...timeChips, h(doc, "span", { class: "detail-tags", "data-ui": "detail-tags" }, ...tagWords))] : []),
    h(doc, "div", { class: "actions", "data-ui": "detail-actions" }, ...buttons),
    ...(text("learns") ? [section(doc, t, "learns", paragraph(doc, text("learns")))] : []),
    h(doc, "div", { class: "tabs detail-tabs", role: "tablist", "data-ui": "detail-tabs" }, ...buttonsOfTabs),
    ...panes,
  ];
  return h(doc, "div", { class: "library-detail", "data-ui": "library-detail" }, ...parts);
}
