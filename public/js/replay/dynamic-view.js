// The list under the diagram of a map-reduce or plan-and-execute replay: the parts the splitter made, or the plan the planner
// wrote, with the state of each (waiting, working, done). Each item names the run that has it and selects it on a click.
import { h } from "../dom.js";

const CLASS = { done: "done", working: "now", waiting: "todo" };

// `parts` and `plan` are what partsOf and planOf give (one of them is empty); `label(id)` turns an agent id into a name;
// `select(id)` shows that agent below. Null when there is nothing to list.
export function dynamicPanel({ doc, t, parts, plan, label, select = () => {} }) {
  const items = parts.length > 0 ? parts : plan;
  if (items.length === 0) return null;
  const kind = parts.length > 0 ? "parts" : "plan";
  return h(
    doc,
    "div",
    { class: "dynamic-panel", "data-ui": `dynamic-${kind}` },
    h(doc, "h4", {}, t(`dynamic.${kind}Heading`)),
    h(
      doc,
      "ol",
      { class: "plan" },
      ...items.map((item) => {
        const pick = h(doc, "button", { type: "button", class: "plan-pick", "data-ui": "dynamic-pick", "data-agent": item.id }, `${label(item.id)} · ${t(`dynamic.status.${item.status}`)}`);
        pick.addEventListener("click", () => select(item.id));
        return h(doc, "li", { class: CLASS[item.status] ?? "todo", "data-ui": "dynamic-item", "data-status": item.status }, h(doc, "span", {}, item.text), pick);
      }),
    ),
    h(doc, "p", { class: "hint" }, t(`dynamic.${kind}Hint`)),
  );
}
