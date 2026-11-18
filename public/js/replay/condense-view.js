// The condensing box of the replay: what was shortened before an agent read it, what it read instead, and the full text on demand.
import { h } from "../dom.js";

// `items` is what condensesOf gives; `label` turns an agent id into a name; `num` formats a number; `isOpen(i)` and `toggle(i)` keep
// which full texts are shown (the box is drawn again at every step). Null when nothing was condensed.
export function condensePanel({ doc, t, items, label, num = String, isOpen = () => false, toggle = () => {} }) {
  if (items.length === 0) return null;
  return h(
    doc,
    "div",
    { class: "cond-host", "data-ui": "condense-panel" },
    ...items.map((item, i) => {
      const open = isOpen(i);
      const button = item.material === null ? null : h(doc, "button", { type: "button", "aria-expanded": String(open), "data-ui": "condense-toggle" }, t(open ? "condense.hide" : "condense.show"));
      button?.addEventListener("click", () => toggle(i));
      return h(
        doc,
        "div",
        { class: "cond", "data-ui": "condense-box" },
        h(doc, "h4", {}, t("condense.heading", { name: label(item.agent), from: num(item.from), to: num(item.to), saved: num(Math.max(0, Math.round((item.from - item.to) / 4))), cost: num(item.tokens) })),
        h(doc, "div", { "data-ui": "condense-summary" }, item.text),
        ...(open && item.material !== null ? [h(doc, "pre", { class: "cond-full", "data-ui": "condense-full" }, item.material)] : []),
        h(doc, "p", { class: "cond-foot" }, ...(button ? [button, " "] : []), h(doc, "span", { class: "badge" }, t("condense.badge"))),
        h(doc, "p", { class: "hint" }, t("condense.warn")),
      );
    }),
  );
}
