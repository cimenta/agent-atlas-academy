// A small popup with the help text of one setting. It reuses the look of the shortcuts popup.
import { h } from "./dom.js";

export function openHelpPopup({ doc, t, title, body }) {
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
  const closeButton = h(doc, "button", { type: "button", class: "shortcuts-close", "data-ui": "help-popup-close", "aria-label": t("harness.help.close"), title: t("harness.help.close") }, "\u00d7");
  closeButton.addEventListener("click", close);
  popup = h(
    doc,
    "div",
    { class: "shortcuts-popup help-popup", role: "dialog", "aria-modal": "true", "aria-label": title, "data-ui": "help-popup" },
    h(doc, "div", { class: "shortcuts-card help-card" }, h(doc, "div", { class: "shortcuts-head" }, h(doc, "h2", {}, title), closeButton), ...String(body).split("\n\n").map((p) => h(doc, "p", {}, p))),
  );
  popup.addEventListener("click", (event) => {
    if (event.target === popup) close();
  });
  doc.body.append(popup);
  doc.addEventListener("keydown", onKey, true);
  closeButton.focus();
  return { close };
}
