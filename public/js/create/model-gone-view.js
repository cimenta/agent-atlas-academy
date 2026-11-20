// Create: what the check of the free OpenRouter models found (see engine/free-check.js). Three states, as in the approved mockup:
// all present (one quiet line), a free model gone (the error and a pick list for each gone tier), and the check could not run (a warning).
// Pure drawing: the result comes from compareFree, and the pick is handed to onPick(tierKey, modelId). Model names come from a foreign list
// and are shown as text only.
import { h } from "../dom.js";

// result: { check: compareFree(...), ageMin: minutes since the check or null, overrides: { tier: id } chosen by the student }.
// tierName(key): the name of a tier. slotName, subText: the name and the small text of the free slot, for the quiet line.
export function modelGoneView({ doc, t, result, tierName, slotName = "", subText = "", onPick }) {
  const check = result?.check;
  if (!check) return null;
  const parts = [];

  if (check.state === "unknown") {
    parts.push(h(doc, "div", { class: "msg warn", role: "status", "data-ui": "model-check-unknown" }, h(doc, "b", {}, t("create.modelCheck.unknownTitle")), t("create.modelCheck.unknownBody")));
    return h(doc, "div", { class: "limits model-check", "data-ui": "model-check" }, ...parts);
  }

  if (check.state === "gone") {
    const fine = ["fast", "balanced", "strong"].filter((key) => !check.gone.some((g) => g.key === key));
    const body = check.gone.map((g) => t("create.modelGone.body", { tier: tierName(g.key), id: g.id })).join(" ");
    const tail = fine.length > 0 ? ` ${t("create.modelGone.fine", { tiers: fine.map(tierName).join(", ") })}` : "";
    parts.push(h(doc, "div", { class: "msg err", role: "status", "data-ui": "model-gone" }, h(doc, "b", {}, check.gone.length === 1 ? t("create.modelGone.title.one") : t("create.modelGone.title.many", { count: String(check.gone.length) })), body + tail));
    for (const g of check.gone) parts.push(pickBox(g));
  } else {
    const label = result.ageMin > 0 ? t("create.modelCheck.ok", { minutes: String(result.ageMin) }) : t("create.modelCheck.okNow");
    parts.push(h(doc, "div", { class: "row", "data-ui": "model-check-ok" }, h(doc, "span", { class: "pv-mark pv-openrouter model-chip", "aria-hidden": "true" }, "Or"), h(doc, "b", {}, slotName), h(doc, "span", { class: "hint" }, subText), h(doc, "span", { class: "good" }, label)));
  }

  // The models the student already chose for a tier (the tier is fine again).
  for (const [key, id] of Object.entries(result.overrides ?? {})) {
    if (check.gone.some((g) => g.key === key)) continue;
    parts.push(h(doc, "p", { class: "hint", "data-ui": "model-gone-used" }, t("create.modelGone.used", { tier: tierName(key), id })));
  }
  return h(doc, "div", { class: "limits model-check", "data-ui": "model-check" }, ...parts);

  function pickBox(g) {
    const heading = h(doc, "h3", {}, t("create.modelGone.choose", { tier: tierName(g.key) }));
    if (check.candidates.length === 0) return h(doc, "div", { class: "box", "data-ui": "model-gone-pick" }, heading, h(doc, "p", { class: "hint" }, t("create.modelGone.none")));
    let chosen = null;
    const button = h(doc, "button", { type: "button", class: "primary", disabled: true, "data-ui": "model-gone-use" }, t("create.modelGone.use"));
    const radios = check.candidates.map((c) => {
      const radio = h(doc, "input", { type: "radio", name: `pick-${g.key}`, value: c.id });
      radio.addEventListener("change", () => {
        chosen = c.id;
        button.removeAttribute("disabled");
      });
      return h(doc, "label", { title: c.name }, radio, " ", h(doc, "span", {}, h(doc, "code", {}, c.id), ` · ${c.forcedFormat ? t("create.modelGone.forced") : t("create.modelGone.noForced")}`));
    });
    button.addEventListener("click", () => {
      if (chosen !== null) onPick(g.key, chosen);
    });
    return h(doc, "div", { class: "box", "data-ui": "model-gone-pick" }, heading, h(doc, "div", { class: "pick" }, ...radios), h(doc, "div", { class: "row" }, button, h(doc, "span", { class: "hint" }, t("create.modelGone.saved"))));
  }
}
