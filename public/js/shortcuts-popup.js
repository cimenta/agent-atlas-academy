// The small popup that the question mark opens over the current page: the list of shortcuts.
import { h } from "./dom.js";
import { SHORTCUTS_HASH } from "./shortcuts.js";
import { buildShortcutList } from "./shortcut-list.js";

export function createShortcutsPopup({ doc, t, getGoKeys }) {
  let popup = null;
  const onKey = (event) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    close();
  };
  function close() {
    if (!popup) return;
    popup.remove();
    popup = null;
    doc.removeEventListener("keydown", onKey, true);
  }
  function toggle() {
    if (popup) return close();
    const closeButton = h(doc, "button", { type: "button", class: "shortcuts-close", "data-ui": "shortcuts-popup-close", "aria-label": t("shortcuts.close"), title: t("shortcuts.close") }, "\u00d7");
    closeButton.addEventListener("click", close);
    const link = h(doc, "a", { href: SHORTCUTS_HASH, "data-ui": "shortcuts-popup-settings" }, t("shortcuts.customise"));
    link.addEventListener("click", close);
    popup = h(
      doc,
      "div",
      { class: "shortcuts-popup", role: "dialog", "aria-modal": "true", "aria-label": t("shortcuts.heading"), "data-ui": "shortcuts-popup" },
      h(doc, "div", { class: "shortcuts-card" }, h(doc, "div", { class: "shortcuts-head" }, h(doc, "h2", {}, t("shortcuts.heading")), closeButton), buildShortcutList(doc, t, getGoKeys()), h(doc, "p", { class: "shortcuts-foot" }, link)),
    );
    popup.addEventListener("click", (event) => {
      if (event.target === popup) close();
    });
    doc.body.append(popup);
    doc.addEventListener("keydown", onKey, true);
    closeButton.focus();
  }
  return { toggle, close, isOpen: () => popup !== null };
}
