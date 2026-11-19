// The list under the diagram of a run in which an agent created agents: each created agent with the instructions its creator
// wrote and its state, and the requests that were refused. A click on Open shows the agent below. Null when there is nothing to list.
import { h } from "../dom.js";

const CLASS = { done: "done", working: "now", waiting: "todo" };

// items: what createdOf gives; refusals: what refusalsOf gives; max: the cap of the creator; label(id): the name of an agent;
// select(id): shows that agent below.
export function createdPanel({ doc, t, items, refusals, max, label, select = () => {} }) {
  if (items.length === 0 && refusals.length === 0) return null;
  return h(
    doc,
    "div",
    { class: "dynamic-panel created-panel", "data-ui": "created-panel" },
    h(doc, "h4", {}, t("player.createdHeading", { n: items.length, max })),
    h(
      doc,
      "ol",
      { class: "plan" },
      ...items.map((item) => {
        const open = h(doc, "button", { type: "button", class: "plan-pick", "data-ui": "created-pick", "data-agent": item.id }, t("player.createdOpen"));
        open.addEventListener("click", () => select(item.id));
        return h(
          doc,
          "li",
          { class: CLASS[item.status] ?? "todo", "data-ui": "created-item", "data-status": item.status },
          h(doc, "b", {}, item.name),
          ` · ${t(`dynamic.status.${item.status}`)} `,
          h(doc, "span", { class: "why" }, item.instructions),
          open,
        );
      }),
      ...refusals.map((r) => h(doc, "li", { class: "refused", "data-ui": "created-refused" }, t("player.createdRefused"), " ", h(doc, "span", { class: "why" }, t(`insp.refused.${r.reason}`)))),
    ),
    h(doc, "p", { class: "hint" }, t("player.createdByHint", { by: label(items[0]?.by ?? refusals[0]?.by) })),
  );
}
