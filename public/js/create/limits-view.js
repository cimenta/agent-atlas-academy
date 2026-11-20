// The warning of the cost panel about the limits of a free account (Groq): one block for each finding, the offers as buttons.
// Pure drawing: the findings and offers come from engine/limits.js, and pressing an offer is handed to onApply.
import { h } from "../dom.js";

const KEEP_AS_IS = new Set(["slowly", "tomorrow"]);

// findings, offers, summary: from engine/limits.js. providerName: the name of the provider that has the limits. nameOf(agentId): the name an agent has.
// slotName(slotId): the name of a key slot. num(n): a number as the page writes it. chosen: the id of the keep-as-is offer the student took.
export function limitsView({ doc, t, findings, offers, summary, providerName: fallbackName, providerNameOf = null, nameOf, slotName, num, chosen = null, onApply }) {
  if (summary === null || summary === undefined) return null;
  const figures = (numbers) => Object.fromEntries(Object.entries(numbers ?? {}).map(([k, v]) => [k, num(v)]));
  const names = (ids) => (ids ?? []).map(nameOf).join(", ");
  // Each block names the provider whose limit it is about; offers name the provider of the first finding.
  const nameFor = (id) => (providerNameOf && id ? providerNameOf(id) : fallbackName);
  const providerName = nameFor(findings[0]?.provider ?? summary.provider);

  // The daily pool of neurons (Cloudflare): its own fits line and bar.
  const poolBar = (neurons, pool) => {
    const share = pool > 0 ? Math.min(100, Math.round((neurons / pool) * 100)) : 0;
    const fill = h(doc, "i", {});
    if (fill.style) fill.style.width = `${Math.max(2, share)}%`;
    return [h(doc, "div", { class: `bar${neurons > pool ? " over" : ""}`, "data-ui": "limits-bar" }, fill), h(doc, "p", { class: "hint" }, t("limits.dayBarNeurons", { neurons: num(Math.ceil(neurons)), pool: num(pool) }))];
  };

  if (findings.length === 0 && summary.pool) {
    const percent = Math.round((summary.neurons / summary.pool) * 100);
    return h(doc, "div", { class: "limits", "data-ui": "limits" }, h(doc, "div", { class: "msg ok", role: "status", "data-ui": "limits-fits" }, h(doc, "b", {}, t("limits.fits.title.neurons", { provider: nameFor(summary.provider) })), t("limits.fits.bodyNeurons", { neurons: num(Math.ceil(summary.neurons)), pool: num(summary.pool), percent: String(percent) })), ...poolBar(summary.neurons, summary.pool));
  }
  if (findings.length === 0) {
    return h(doc, "div", { class: "limits", "data-ui": "limits" }, h(doc, "div", { class: "msg ok", role: "status", "data-ui": "limits-fits" }, h(doc, "b", {}, t("limits.fits.title", { provider: nameFor(summary.provider) })), t(summary.tpm === null ? "limits.fits.bodyRequests" : "limits.fits.body", { ...figures(summary), provider: providerName })));
  }

  // Requests-only findings (OpenRouter) have their own texts: no tokens, and the limit counts for the whole account.
  const titleKey = (f) => (f.kind === "slow" && f.numbers?.calls !== undefined ? "slowRequests" : f.kind);
  const bodyKey = (f) => (f.kind === "day-requests" && f.account ? "day-requests.account" : titleKey(f));
  const blocks = findings.map((f) => {
    const params = { ...figures(f.numbers), agents: names(f.agents), provider: nameFor(f.provider) };
    const block = h(doc, "div", { class: `msg ${f.kind === "call-too-big" ? "err" : "warn"}`, role: "status", "data-ui": `limits-${f.kind}` }, h(doc, "b", {}, t(`limits.${titleKey(f)}.title`, params)), t(`limits.${bodyKey(f)}.body`, params));
    return block;
  });

  // The day bar: how much of the day's tokens the run may use.
  let bar = null;
  const day = findings.find((f) => f.kind === "day-tokens" || (f.kind === "slow" && f.numbers.total !== undefined));
  const dayNeurons = findings.find((f) => f.kind === "day-neurons");
  const dayCalls = findings.find((f) => f.kind === "day-requests" && summary.tpd === null);
  if (dayNeurons) {
    bar = poolBar(dayNeurons.numbers.neurons, dayNeurons.numbers.pool);
  } else if (dayCalls) {
    const share = Math.min(100, Math.round((dayCalls.numbers.calls / dayCalls.numbers.rpd) * 100));
    const fill = h(doc, "i", {});
    if (fill.style) fill.style.width = `${Math.max(2, share)}%`;
    bar = [h(doc, "div", { class: `bar${dayCalls.numbers.calls > dayCalls.numbers.rpd ? " over" : " mid"}`, "data-ui": "limits-bar" }, fill), h(doc, "p", { class: "hint" }, t("limits.dayBarRequests", { calls: num(dayCalls.numbers.calls), rpd: num(dayCalls.numbers.rpd) }))];
  } else if (day) {
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
    // An offer that lowers the use of the daily pool says what the new estimate is.
    const estimate = offer.estimate ? [" ", t("limits.offer.estimateNeurons", { neurons: num(offer.estimate.neurons) })] : [];
    return h(doc, "div", { class: "offer" }, h(doc, "p", {}, h(doc, "b", {}, t(`limits.offer.${offer.id}.title`, params)), " ", t(bodyKey, params), ...estimate), button);
  };

  return h(doc, "div", { class: "limits", "data-ui": "limits" }, ...blocks, ...(bar ?? []), ...(offers.length > 0 ? [h(doc, "div", { class: "offers", "data-ui": "limits-offers" }, ...offers.map(offerRow))] : []));
}
