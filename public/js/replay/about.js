// The About panel of a run: title, author, link and a description in Markdown.
// Anyone can read it; the owner of a local run can edit it. Pure helpers are exported for tests.
import { h } from "../dom.js";
import { parseMarkdown, isSafeHref } from "../markdown.js";
import { renderBlocks } from "../render.js";
import { ABOUT_FIELDS, ABOUT_LIMITS } from "../run-schema.js";

// Trims every field and drops the empty ones. Null when nothing is left.
export function cleanAbout(values) {
  const about = {};
  for (const key of ABOUT_FIELDS) {
    const value = typeof values?.[key] === "string" ? values[key].trim() : "";
    if (value !== "") about[key] = value;
  }
  return Object.keys(about).length > 0 ? about : null;
}

export const isHttpUrl = (text) => /^https?:\/\/\S+$/i.test(text) && isSafeHref(text);

export function createAboutPanel({ doc, t, getAbout, editable, onSave }) {
  const element = h(doc, "section", { class: "about-panel", "data-ui": "run-about", "aria-label": t("about.heading"), hidden: true });
  let editing = false;

  function viewMode() {
    const about = getAbout();
    const parts = [h(doc, "h3", {}, t("about.heading"))];
    if (!about) {
      parts.push(h(doc, "p", { class: "hint" }, t(editable ? "about.empty" : "about.emptyReadonly")));
    } else {
      if (about.title) parts.push(h(doc, "p", { class: "about-title", "data-ui": "about-title" }, about.title));
      if (about.author) parts.push(h(doc, "p", { class: "about-author", "data-ui": "about-author" }, t("about.by", { author: about.author })));
      if (about.url && isHttpUrl(about.url)) parts.push(h(doc, "p", { class: "about-url" }, h(doc, "a", { href: about.url, rel: "noopener noreferrer", target: "_blank", "data-ui": "about-url" }, about.url)));
      if (about.description) parts.push(h(doc, "div", { class: "about-description article", "data-ui": "about-description" }, renderBlocks(parseMarkdown(about.description), doc)));
    }
    const buttons = [];
    if (editable) {
      const edit = h(doc, "button", { type: "button", "data-ui": "about-edit" }, t("about.edit"));
      edit.addEventListener("click", () => {
        editing = true;
        draw();
      });
      buttons.push(edit);
    }
    const close = h(doc, "button", { type: "button", "data-ui": "about-close" }, t("about.close"));
    close.addEventListener("click", () => api.close());
    buttons.push(close);
    parts.push(h(doc, "div", { class: "about-buttons" }, ...buttons));
    return parts;
  }

  function editMode() {
    const about = getAbout() ?? {};
    const field = (id, label, input) => h(doc, "div", { class: "field" }, h(doc, "label", { for: id }, label), input);
    const title = h(doc, "input", { id: "about-title", type: "text", maxlength: ABOUT_LIMITS.title, value: about.title ?? "", "data-ui": "about-title-input" });
    const author = h(doc, "input", { id: "about-author", type: "text", maxlength: ABOUT_LIMITS.author, value: about.author ?? "", "data-ui": "about-author-input" });
    const url = h(doc, "input", { id: "about-url", type: "url", maxlength: ABOUT_LIMITS.url, value: about.url ?? "", placeholder: "https://", "data-ui": "about-url-input" });
    const description = h(doc, "textarea", { id: "about-description", rows: 8, maxlength: ABOUT_LIMITS.description, "data-ui": "about-description-input" });
    description.value = about.description ?? "";
    const message = h(doc, "p", { class: "notice", role: "alert", hidden: true });
    const save = h(doc, "button", { type: "button", class: "primary", "data-ui": "about-save" }, t("about.save"));
    const cancel = h(doc, "button", { type: "button", "data-ui": "about-cancel" }, t("about.cancel"));
    const problem = (key) => {
      message.textContent = t(key);
      message.hidden = false;
    };
    save.addEventListener("click", async () => {
      const cleaned = cleanAbout({ title: title.value, author: author.value, url: url.value, description: description.value });
      if (cleaned?.url && !isHttpUrl(cleaned.url)) return problem("about.badUrl");
      const result = await onSave(cleaned);
      if (!result?.ok) return problem("about.saveFailed");
      editing = false;
      draw();
    });
    cancel.addEventListener("click", () => {
      editing = false;
      draw();
    });
    return [
      h(doc, "h3", {}, t("about.heading")),
      field("about-title", t("about.titleLabel"), title),
      field("about-author", t("about.authorLabel"), author),
      field("about-url", t("about.urlLabel"), url),
      field("about-description", t("about.descriptionLabel"), description),
      message,
      h(doc, "div", { class: "about-buttons" }, save, cancel),
    ];
  }

  function draw() {
    element.replaceChildren(...(editing ? editMode() : viewMode()));
  }

  const api = {
    element,
    isOpen: () => !element.hidden,
    open() {
      editing = false;
      draw();
      element.hidden = false;
    },
    close() {
      element.hidden = true;
      editing = false;
    },
    toggle() {
      if (api.isOpen()) api.close();
      else api.open();
    },
  };
  return api;
}
