// The run menu: a cog that opens a small list (About, Export run, ...). It is used in the player
// and on every row of the library. The items are asked for when the menu opens, so a row can load
// its run only when someone really opens the menu.
import { h } from "../dom.js";

// getItems() returns (or resolves to) a list of { ui, label, hint, danger, onClick }.
export function createRunMenu({ doc, t, getItems }) {
  const cog = h(doc, "button", { type: "button", class: "cog-button", "data-ui": "run-cog", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": t("player.runMenu"), title: t("player.runMenu") }, "⚙");
  const list = h(doc, "div", { class: "run-menu-list", role: "menu", "data-ui": "run-menu", hidden: true });
  const element = h(doc, "div", { class: "run-menu" }, cog, list);
  let leaveTimer;
  let opening = 0;

  const outsideClick = (event) => {
    if (!element.contains(event.target)) close();
  };
  const escapeKey = (event) => {
    if (event.key === "Escape") close();
  };
  function close() {
    opening += 1;
    if (list.hidden) return;
    list.hidden = true;
    cog.setAttribute("aria-expanded", "false");
    doc.removeEventListener("click", outsideClick);
    doc.removeEventListener("keydown", escapeKey);
  }
  async function open() {
    const mine = ++opening;
    const items = await getItems();
    if (mine !== opening) return;
    list.replaceChildren(
      ...(items.length === 0
        ? [h(doc, "p", { class: "hint run-menu-empty" }, t("player.menuEmpty"))]
        : items.map((item) => {
            const button = h(doc, "button", { type: "button", role: "menuitem", class: item.danger ? "run-menu-item danger" : "run-menu-item", "data-ui": item.ui, title: item.hint }, item.label);
            button.addEventListener("click", () => {
              close();
              item.onClick();
            });
            return button;
          })),
    );
    list.hidden = false;
    cog.setAttribute("aria-expanded", "true");
    doc.addEventListener("click", outsideClick);
    doc.addEventListener("keydown", escapeKey);
  }
  cog.addEventListener("click", () => (list.hidden ? open() : close()));

  // With a mouse the menu closes shortly after the pointer leaves it. On a touch screen it stays until a tap elsewhere.
  const hasMouse = () => doc.defaultView?.matchMedia?.("(hover: hover)").matches === true;
  element.addEventListener("mouseleave", () => {
    if (!hasMouse()) return;
    clearTimeout(leaveTimer);
    leaveTimer = setTimeout(close, 250);
  });
  element.addEventListener("mouseenter", () => clearTimeout(leaveTimer));

  return { element, close };
}
