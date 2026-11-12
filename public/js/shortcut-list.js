// The list of keyboard shortcuts, drawn the same way in the popup (read only) and on the Settings tab,
// where the letter after g can be changed.
import { h } from "./dom.js";
import { SHORTCUT_GROUPS } from "./shortcuts.js";

export function buildShortcutList(doc, t, goKeys, { editable = false, onEdit = () => {} } = {}) {
  const cap = (label) => h(doc, "kbd", {}, label);
  const keysOf = (item) => {
    if (item.go && editable) {
      const input = h(doc, "input", { type: "text", maxlength: "1", class: "kbd-edit", value: goKeys[item.go], "aria-label": t(item.label), "data-go": item.go, autocomplete: "off", spellcheck: "false" });
      input.addEventListener("change", () => onEdit(item.go, input.value, input));
      return h(doc, "span", { class: "kbd-keys" }, cap("g"), ` ${t("shortcuts.then")} `, input);
    }
    const combos = item.go ? [["g", goKeys[item.go]]] : item.combos;
    return h(
      doc,
      "span",
      { class: "kbd-keys" },
      ...combos.flatMap((combo, i) => [...(i > 0 ? [" / "] : []), ...combo.flatMap((label, j) => [...(j > 0 && item.sequence ? [` ${t("shortcuts.then")} `] : []), cap(label)])]),
    );
  };
  return h(
    doc,
    "div",
    { class: "kbd-list", "data-ui": "shortcut-list" },
    ...SHORTCUT_GROUPS.flatMap((group) => [h(doc, "h3", {}, t(group.title)), h(doc, "div", { class: "kbd-grid" }, ...group.items.map((item) => h(doc, "div", { class: "kbd-row" }, h(doc, "span", {}, t(item.label)), keysOf(item))))]),
  );
}
