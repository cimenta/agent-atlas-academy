// Settings, Keys: what a free account of a provider allows, and which models the provider is used with.
// Pure drawing from the registry; the numbers are data of the provider, never written here.
import { h } from "./dom.js";
import { modelsOfSlot } from "./engine/providers.js";
import { slotIsFree, slotLabelKey } from "./key-slots.js";

const ROWS = ["rpm", "tpm", "rpd", "tpd"];

// limits: provider.freeLimits. num(n): a number as the page writes it. A limit that is null (OpenRouter has no token limits) has no row.
// providerName: the name of the provider. dataKey: the locale key of the data notice (the provider's own, else the general one).
export function limitsBox({ doc, t, limits, num, providerName = "", dataKey = "settings.freeLimitsData" }) {
  const pool = typeof limits.neuronsPerDay === "number";
  const table = h(doc, "table", {}, h(doc, "tr", {}, h(doc, "th", {}, t("settings.freeLimitsHeadLimit")), h(doc, "th", {}, t("settings.freeLimitsHeadFree")), h(doc, "th", {}, t("settings.freeLimitsHeadMeaning"))));
  // Cloudflare has one limit, a pool of neurons a day for all models and the whole account.
  if (pool) table.append(h(doc, "tr", {}, h(doc, "td", {}, t("settings.freeLimits.neurons")), h(doc, "td", {}, num(limits.neuronsPerDay)), h(doc, "td", {}, t("settings.freeLimits.neuronsMeaning"))));
  for (const key of ROWS.filter((k) => typeof limits[k] === "number")) {
    // The day limit of OpenRouter rises when the account has bought credits; the note says so with the number.
    const meaning = key === "rpd" && typeof limits.creditsRaiseDay === "number" ? t("settings.freeLimits.rpdMeaningCredits", { raised: num(limits.creditsRaiseDay) }) : t(`settings.freeLimits.${key}Meaning`);
    table.append(h(doc, "tr", {}, h(doc, "td", {}, t(`settings.freeLimits.${key}`)), h(doc, "td", {}, num(limits[key])), h(doc, "td", {}, meaning)));
  }
  const accountNote = pool ? t("settings.freeLimitsAccountPool", { provider: providerName }) : limits.perModel === false ? t("settings.freeLimitsAccountAll", { provider: providerName }) : t("settings.freeLimitsAccount");
  const hint = pool ? t("settings.freeLimitsHintPool", { provider: providerName }) : typeof limits.tpm === "number" ? t("settings.freeLimitsHint") : t("settings.freeLimitsHintRequests");
  return h(doc, "div", { class: "limits-box", "data-ui": "free-limits" }, h(doc, "h3", {}, t(pool ? "settings.freeLimitsTitleSingle" : "settings.freeLimitsTitle")), h(doc, "p", { class: "hint" }, accountNote), table, h(doc, "p", { class: "hint" }, hint), h(doc, "p", { class: "hint" }, h(doc, "b", {}, t("settings.freeLimitsDataLead")), " ", t(dataKey)));
}

// The models of a provider (of one key slot when slot is given), one row for each model id: choices that share an id
// (Balanced and Strong on Groq) are one row.
export function modelRows(provider, slot = null) {
  const rows = [];
  for (const m of slot ? modelsOfSlot(slot) : provider.models) {
    const row = rows.find((r) => r.id === m.id);
    if (row) row.keys.push(m.key);
    else rows.push({ id: m.id, keys: [m.key], forcedFormat: m.forcedFormat, inputPerMTok: m.inputPerMTok, outputPerMTok: m.outputPerMTok, neuronsInPerM: m.neuronsInPerM, neuronsOutPerM: m.neuronsOutPerM });
  }
  return rows;
}

// slot: the key slot whose ids are shown. A free slot with ids of its own shows whether the model takes a forced reply format; a paid slot
// with ids of its own shows the prices. overrides: { tier: id } the student chose for gone models; onReset(tier) takes one back.
export function modelsBox({ doc, t, provider, slot = null, overrides = {}, onReset = null, locale = "en-US" }) {
  const rows = modelRows(provider, slot);
  const own = provider.models.some((m) => typeof m.freeId === "string") || provider.models.some((m) => typeof m.neuronsInPerM === "number");
  const neuronRates = provider.models.some((m) => typeof m.neuronsInPerM === "number");
  const showForced = own && !neuronRates && slot !== null && slotIsFree(slot) && rows.some((r) => typeof r.forcedFormat === "boolean");
  const showNeurons = neuronRates && slot !== null && slotIsFree(slot);
  const showPrices = own && slot !== null && !slotIsFree(slot);
  // A typical run (30,000 tokens in, 10,000 out) in neurons, to the nearest ten, and how many of them fit the daily pool.
  const pool = provider.freeLimits?.neuronsPerDay;
  const typical = (r) => (30000 * r.neuronsInPerM + 10000 * r.neuronsOutPerM) / 1e6;
  const money = (n) => n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pair = locale.startsWith("cs") ? "; " : ", ";
  const head = [h(doc, "th", {}, t("settings.modelsChoice")), h(doc, "th", {}, t("settings.modelsModel")), ...(showForced ? [h(doc, "th", {}, t("settings.modelsForced"))] : []), ...(showNeurons ? [h(doc, "th", {}, t("settings.modelsNeurons")), h(doc, "th", {}, t("settings.modelsTypical"))] : []), ...(showPrices ? [h(doc, "th", {}, t("settings.modelsPrices"))] : [])];
  const table = h(doc, "table", {}, h(doc, "tr", {}, ...head));
  for (const row of rows) {
    const choice = row.keys.length > 1 ? t("settings.modelsShared", { first: t(`settings.tier.${row.keys[0]}`), second: t(`settings.tier.${row.keys[1]}`) }) : t(`settings.tier.${row.keys[0]}`);
    const chosen = row.keys.map((k) => overrides?.[k]).find((id) => typeof id === "string");
    const model = chosen === undefined ? [h(doc, "code", {}, row.id)] : [h(doc, "code", {}, chosen), " ", h(doc, "span", { class: "hint" }, t("settings.modelsChosen")), " ", ...(onReset ? [resetButton(row.keys[0])] : [])];
    const cells = [h(doc, "td", {}, choice), h(doc, "td", {}, ...model)];
    if (showForced) cells.push(h(doc, "td", {}, chosen !== undefined ? "–" : row.forcedFormat === false ? t("settings.modelsForcedNo") : t("settings.modelsForcedYes")));
    if (showNeurons) {
      const n = typical(row);
      cells.push(h(doc, "td", {}, `${row.neuronsInPerM.toLocaleString(locale)}${pair}${row.neuronsOutPerM.toLocaleString(locale)}`), h(doc, "td", {}, t("settings.modelsTypicalRun", { neurons: (Math.round(n / 10) * 10).toLocaleString(locale), runs: String(Math.floor(pool / n)) })));
    }
    if (showPrices) cells.push(h(doc, "td", {}, `${money(row.inputPerMTok)}${pair}${money(row.outputPerMTok)}`));
    table.append(h(doc, "tr", {}, ...cells));
  }
  function resetButton(key) {
    const button = h(doc, "button", { type: "button", "data-ui": `model-reset-${key}` }, t("settings.modelsReset"));
    button.addEventListener("click", () => onReset(key));
    return button;
  }
  const shared = rows.some((r) => r.keys.length > 1);
  const notes = [];
  if (shared) notes.push(h(doc, "p", { class: "hint" }, t("settings.modelsSharedNote")));
  if (provider.text?.modelsNote && slot !== null && slotIsFree(slot)) notes.push(h(doc, "p", { class: "hint" }, t(provider.text.modelsNote)));
  if (provider.capabilities?.search === false) notes.push(h(doc, "p", { class: "hint" }, t("settings.modelsNoSearch", { provider: provider.label })));
  return h(doc, "div", { class: "limits-box", "data-ui": "models-note" }, h(doc, "h3", {}, t("settings.modelsTitle", { provider: own && slot !== null && slotLabelKey(slot) ? t(slotLabelKey(slot)) : provider.label })), table, ...notes);
}
