// The help popup of a setting or a part of the page: it shows one section of the Help text, so the words are
// written once, in Help. A ? button (helpIcon) opens it.
import { h } from "./dom.js";
import { parseMarkdown } from "./markdown.js";
import { renderBlocks } from "./render.js";
import { findSection } from "./help-topics.js";

export function openHelpPopup({ doc, t, id }) {
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
  function content(sectionId) {
    const found = findSection(t("help.body"), sectionId);
    if (!found) return null;
    const { section, topic } = found;
    const closeButton = h(doc, "button", { type: "button", class: "shortcuts-close", "data-ui": "help-popup-close", "aria-label": t("help.popup.close"), title: t("help.popup.close") }, "\u00d7");
    closeButton.addEventListener("click", close);
    const related = section.related.map((rid) => ({ rid, found: findSection(t("help.body"), rid) })).filter((r) => r.found);
    const chips = related.map(({ rid, found: other }) => {
      const chip = h(doc, "button", { type: "button", class: "help-chip", "data-ui": `help-related-${rid}` }, other.section.title);
      chip.addEventListener("click", () => show(rid));
      return chip;
    });
    const more = h(doc, "a", { href: `#/help/${sectionId}`, "data-ui": "help-popup-more" }, t("help.popup.more"));
    more.addEventListener("click", close);
    return h(
      doc,
      "div",
      { class: "shortcuts-card help-card" },
      h(doc, "div", { class: "shortcuts-head" }, h(doc, "h2", {}, section.title), closeButton),
      renderBlocks(parseMarkdown(section.text), doc),
      chips.length ? h(doc, "div", { class: "help-related" }, h(doc, "span", {}, t("help.popup.related")), ...chips) : "",
      h(doc, "p", { class: "help-source" }, `${t("help.popup.from", { topic: topic.title })} `, more),
    );
  }
  function show(sectionId) {
    const card = content(sectionId);
    if (!card) return false;
    popup.replaceChildren(card);
    popup.querySelector("[data-ui=help-popup-close]")?.focus();
    return true;
  }
  const first = content(id);
  if (!first) return null;
  popup = h(doc, "div", { class: "shortcuts-popup help-popup", role: "dialog", "aria-modal": "true", "aria-label": findSection(t("help.body"), id).section.title, "data-ui": "help-popup" }, first);
  popup.addEventListener("click", (event) => {
    if (event.target === popup) close();
  });
  doc.body.append(popup);
  doc.addEventListener("keydown", onKey, true);
  popup.querySelector("[data-ui=help-popup-close]")?.focus();
  return { close };
}

// The round ? button that opens the section of Help with this id. name is what it is about, for the screen reader.
export function helpIcon({ doc, t, id, name }) {
  const button = h(doc, "button", { type: "button", class: "help-icon", "data-ui": `help-${id}`, "aria-label": t("help.popup.open", { name }), title: t("help.popup.open", { name }) }, "?");
  button.addEventListener("click", () => openHelpPopup({ doc, t, id }));
  return button;
}
