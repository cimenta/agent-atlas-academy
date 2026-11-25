// The Settings tab of the replay: how the chosen agent was set up in this run. Read from the design of the run, so it also works for old runs.
import { h } from "../dom.js";
import { AGENT_TYPES, providerCatalog } from "../engine/catalog.js";
import { slotProvider } from "../key-slots.js";

const LIMIT_KEYS = [["maxSteps", "insp.set.limitSteps"], ["maxTokens", "insp.set.limitTokens"], ["maxOutputTokens", "insp.set.limitReply"], ["maxSearches", "insp.set.limitSearches"]];
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const cut = (text, max = 600) => (text.length > max ? `${text.slice(0, max)}…` : text);

// The rows for one agent: [{ key, text? , pre? }] where key is the label key and text or pre is the value (already worded).
// node: the agent of the design (null when the run did not record it); agent: the inspector's agent (its model id).
export function settingsRows({ node, design, agent, t, num = (n) => String(n) }) {
  const yes = (v) => t(v ? "insp.set.on" : "insp.set.off");
  const rows = [];
  if (!node) return [{ key: "insp.set.role", text: agent?.label ?? "" }];
  rows.push({ key: "insp.set.role", text: AGENT_TYPES[node.agent]?.label ?? node.agent });
  const slot = typeof node.slot === "string" ? node.slot : null;
  const provider = providerCatalog(slot ? slotProvider(slot) : undefined).label;
  const free = slot ? slot.endsWith("-free") : false;
  rows.push({ key: "insp.set.provider", text: slot ? `${provider}${free ? ` · ${t("insp.set.free")}` : ""}` : provider });
  const tier = typeof node.model === "string" ? t(`settings.tier.${node.model}`) : "";
  rows.push({ key: "insp.set.model", text: [tier, node.modelId ?? agent?.model].filter(Boolean).join(" · ") });
  rows.push({ key: "insp.set.search", text: yes(node.search === true) });
  if (typeof node.stance === "string" && node.stance !== "") rows.push({ key: "insp.set.stance", text: node.stance });
  rows.push(typeof node.instructions === "string" && node.instructions.trim() !== "" ? { key: "insp.set.instructions", pre: node.instructions } : { key: "insp.set.instructions", text: t("insp.set.defaultInstructions") });
  const limits = isObject(node.limits) ? LIMIT_KEYS.filter(([k]) => Number.isFinite(node.limits[k])).map(([k, label]) => `${t(label)}: ${num(node.limits[k])}`) : [];
  rows.push({ key: "insp.set.limits", text: limits.length > 0 ? limits.join(" · ") : t("insp.set.runLimits") });
  if (limits.length > 0) rows.push({ key: "insp.set.onLimit", text: t(node.onLimit === "pass" ? "insp.set.onLimitPass" : "insp.set.onLimitStop") });
  if (design?.memory?.notebook === true && typeof node.notebook === "string") rows.push({ key: "insp.set.notebook", text: t(`insp.set.notebook.${node.notebook}`) });
  if (node.condense === true) rows.push({ key: "insp.set.condense", text: yes(true) });
  if (node.approve === true) rows.push({ key: "insp.set.approve", text: yes(true) });
  if (node.addToPrevious === true) rows.push({ key: "insp.set.addToPrevious", text: yes(true) });
  if (isObject(node.format)) rows.push({ key: "insp.set.format", pre: cut(JSON.stringify(node.format, null, 2)) });
  if (Array.isArray(node.guardrails) && node.guardrails.length > 0) rows.push({ key: "insp.set.guardrails", pre: cut(JSON.stringify(node.guardrails, null, 2)) });
  if (Array.isArray(node.skills) && node.skills.length > 0) {
    rows.push({ key: "insp.set.skills", text: node.skills.map((e) => `${t(`skills.kind.${e.kind}`)}: ${e.name}${e.param ? ` (${t(`skills.culture.${e.param}`)})` : ""}`).join(" · ") });
    rows.push({ key: "insp.set.skillsText", pre: cut(node.skills.map((e) => e.text).join("\n\n"), 1200) });
  }
  if (isObject(node.creates)) rows.push({ key: "insp.set.creates", pre: cut(JSON.stringify(node.creates, null, 2)) });
  return rows;
}

export function settingsView({ doc, t, node, design, agent, num }) {
  const rows = settingsRows({ node, design, agent, t, num });
  return h(
    doc,
    "div",
    { class: "agent-settings", "data-ui": "agent-settings" },
    h(doc, "p", { class: "agenthead" }, `${t("insp.set.of")} `, h(doc, "b", {}, agent.label)),
    h(
      doc,
      "table",
      { class: "detail-table", "data-ui": "agent-settings-table" },
      ...rows.map((row) => h(doc, "tr", { "data-row": row.key }, h(doc, "th", {}, t(row.key)), h(doc, "td", {}, row.pre !== undefined ? h(doc, "pre", { class: "raw" }, row.pre) : row.text))),
    ),
    h(doc, "p", { class: "hint" }, t("insp.set.note")),
  );
}
