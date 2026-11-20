// Settings, Keys: what a free account of a provider allows, and which models the provider is used with.
// Pure drawing from the registry; the numbers are data of the provider, never written here.
import { h } from "./dom.js";

const ROWS = ["rpm", "tpm", "rpd", "tpd"];

// limits: provider.freeLimits. num(n): a number as the page writes it.
export function limitsBox({ doc, t, limits, num }) {
  const table = h(doc, "table", {}, h(doc, "tr", {}, h(doc, "th", {}, t("settings.freeLimitsHeadLimit")), h(doc, "th", {}, t("settings.freeLimitsHeadFree")), h(doc, "th", {}, t("settings.freeLimitsHeadMeaning"))));
  for (const key of ROWS) table.append(h(doc, "tr", {}, h(doc, "td", {}, t(`settings.freeLimits.${key}`)), h(doc, "td", {}, num(limits[key])), h(doc, "td", {}, t(`settings.freeLimits.${key}Meaning`))));
  return h(doc, "div", { class: "limits-box", "data-ui": "free-limits" }, h(doc, "h3", {}, t("settings.freeLimitsTitle")), h(doc, "p", { class: "hint" }, t("settings.freeLimitsAccount")), table, h(doc, "p", { class: "hint" }, t("settings.freeLimitsHint")), h(doc, "p", { class: "hint" }, h(doc, "b", {}, t("settings.freeLimitsDataLead")), " ", t("settings.freeLimitsData")));
}

// The models of a provider, one row for each model id: choices that share an id (Balanced and Strong on Groq) are one row.
export function modelRows(provider) {
  const rows = [];
  for (const m of provider.models) {
    const row = rows.find((r) => r.id === m.id);
    if (row) row.keys.push(m.key);
    else rows.push({ id: m.id, keys: [m.key] });
  }
  return rows;
}

export function modelsBox({ doc, t, provider }) {
  const rows = modelRows(provider);
  const table = h(doc, "table", {}, h(doc, "tr", {}, h(doc, "th", {}, t("settings.modelsChoice")), h(doc, "th", {}, t("settings.modelsModel"))));
  for (const row of rows) {
    const choice = row.keys.length > 1 ? t("settings.modelsShared", { first: t(`settings.tier.${row.keys[0]}`), second: t(`settings.tier.${row.keys[1]}`) }) : t(`settings.tier.${row.keys[0]}`);
    table.append(h(doc, "tr", {}, h(doc, "td", {}, choice), h(doc, "td", {}, h(doc, "code", {}, row.id))));
  }
  const shared = rows.some((r) => r.keys.length > 1);
  return h(doc, "div", { class: "limits-box", "data-ui": "models-note" }, h(doc, "h3", {}, t("settings.modelsTitle", { provider: provider.label })), table, ...(shared ? [h(doc, "p", { class: "hint" }, t("settings.modelsSharedNote"))] : []), ...(provider.capabilities?.search === false ? [h(doc, "p", { class: "hint" }, t("settings.modelsNoSearch", { provider: provider.label }))] : []));
}
