// The warning of the cost panel about the limits of a free account (Groq): one block for each finding, the offers as buttons.
// Pure drawing: the findings and offers come from engine/limits.js, and pressing an offer is handed to onApply.
import { h } from "../dom.js";

const KEEP_AS_IS = new Set(["slowly", "tomorrow"]);

// findings, offers, summary: from engine/limits.js. providerName: the name of the provider that has the limits. nameOf(agentId): the name an agent has.
// slotName(slotId): the name of a key slot. num(n): a number as the page writes it. chosen: the id of the keep-as-is offer the student took.
export function limitsView({ doc, t, findings, offers, summary, providerName, nameOf, slotName, num, chosen = null, onApply }) {
  if (summary === null || summary === undefined) return null;
  const figures = (numbers) => Object.fromEntries(Object.entries(numbers ?? {}).map(([k, v]) => [k, num(v)]));
  const names = (ids) => (ids ?? []).map(nameOf).join(", ");

  if (findings.length === 0) {
    return h(doc, "div", { class: "limits", "data-ui": "limits" }, h(doc, "div", { class: "msg ok", role: "status", "data-ui": "limits-fits" }, h(doc, "b", {}, t("limits.fits.title", { provider: providerName })), t("limits.fits.body", { ...figures(summary), provider: providerName })));
  }

  const blocks = findings.map((f) => {
    const params = { ...figures(f.numbers), agents: names(f.agents), provider: providerName };
    const block = h(doc, "div", { class: `msg ${f.kind === "call-too-big" ? "err" : "warn"}`, role: "status", "data-ui": `limits-${f.kind}` }, h(doc, "b", {}, t(`limits.${f.kind}.title`, params)), t(`limits.${f.kind}.body`, params));
    return block;
  });

  // The day bar: how much of the day's tokens the run may use.
  let bar = null;
  const day = findings.find((f) => f.kind === "day-tokens" || f.kind === "slow");
  if (day) {
    const total = day.numbers.total ?? summary.total;
    const tpd = day.numbers.tpd ?? summary.tpd;
    const share = tpd > 0 ? Math.min(100, Math.round((total / tpd) * 100)) : 0;
    const fill = h(doc, "i", {});
    if (fill.style) fill.style.width = `${Math.max(2, share)}%`;
    bar = [h(doc, "div", { class: `bar${total > tpd ? " over" : " mid"}`, "data-ui": "limits-bar" }, fill), h(doc, "p", { class: "hint" }, t("limits.dayBar", { total: num(total), tpd: num(tpd) }))];
  }

  const offerRow = (offer) => {
    if (KEEP_AS_IS.has(offer.id) && chosen === offer.id) return h(doc, "div", { class: "offer chosen", "data-ui": "offer-chosen" }, h(doc, "p", {}, h(doc, "b", {}, t(`limits.offer.${offer.id}.title`, { provider: providerName })), " ", t("limits.chosen")));
    const params = { provider: providerName, agents: names(offer.agents), moved: names(offer.moved), slot: offer.slot ? slotName(offer.slot) : "", output: num(offer.values?.outputTokens ?? 0), handoff: num(offer.values?.handoffChars ?? 0) };
    const bodyKey = offer.id === "paid-key" && offer.disabled ? "limits.offer.paid-key.missing" : `limits.offer.${offer.id}.body`;
    const label = offer.disabled ? t("limits.unavailable") : KEEP_AS_IS.has(offer.id) ? t("limits.keep") : t("limits.apply");
    const button = h(doc, "button", { type: "button", "data-ui": `offer-${offer.id}`, disabled: offer.disabled === true }, label);
    if (!offer.disabled) button.addEventListener("click", () => onApply(offer));
    return h(doc, "div", { class: "offer" }, h(doc, "p", {}, h(doc, "b", {}, t(`limits.offer.${offer.id}.title`, params)), " ", t(bodyKey, params)), button);
  };

  return h(doc, "div", { class: "limits", "data-ui": "limits" }, ...blocks, ...(bar ?? []), ...(offers.length > 0 ? [h(doc, "div", { class: "offers", "data-ui": "limits-offers" }, ...offers.map(offerRow))] : []));
}
