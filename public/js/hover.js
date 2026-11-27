// One hover card for the whole app. An element describes itself with data-hover-title / -text / -badge / -hint / -rows (JSON list of [name, value]),
// and a plain title="..." attribute is adopted the first time the pointer or the keyboard reaches it, so every tooltip looks the same.
import { createHoverCard } from "./replay/hover-card.js";

// "Share: sends the run to the library" becomes a title and a text; a short text with no colon is only a title, a long one only a text.
export function splitTitle(text) {
  const value = String(text ?? "").trim();
  const at = value.indexOf(": ");
  if (at > 0 && at <= 40) return { title: value.slice(0, at), text: value.slice(at + 2) };
  return value.length <= 40 ? { title: value } : { text: value };
}

// Moves a native title into the hover attributes (the card replaces the browser tooltip). The element keeps its name for screen readers.
export function adoptTitle(el) {
  const native = el.getAttribute?.("title");
  if (native === null || native === undefined || native.trim() === "") return;
  if (el.getAttribute("data-hover-title") === null && el.getAttribute("data-hover-text") === null) {
    const { title, text } = splitTitle(native);
    if (title) el.setAttribute("data-hover-title", title);
    if (text) el.setAttribute("data-hover-text", text);
  }
  if (el.getAttribute("aria-label") === null && (el.textContent ?? "").trim() === "") el.setAttribute("aria-label", native.trim());
  el.removeAttribute("title");
}

// What the card shows for an element: { title?, badge?, text?, hint?, rows? }, or null when the element has nothing to say.
export function hoverInfoOf(el) {
  const get = (name) => {
    const value = el.getAttribute?.(name);
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  const info = { title: get("data-hover-title"), badge: get("data-hover-badge"), text: get("data-hover-text"), hint: get("data-hover-hint") };
  const rows = get("data-hover-rows");
  if (rows) {
    try {
      const parsed = JSON.parse(rows);
      if (Array.isArray(parsed)) info.rows = parsed.filter((r) => Array.isArray(r) && r.length === 2).map(([k, v]) => [String(k), String(v)]);
    } catch {
      // a broken list is ignored: the card still shows the rest
    }
  }
  return info.title || info.text ? info : null;
}

// Wires the card to the whole document: pointer, keyboard focus, Escape, scrolling and clicks close it.
export function installHover({ doc, clock, delayMs }) {
  const card = createHoverCard({ doc, clock, delayMs });
  let active = null;
  const find = (target) => target?.closest?.("[data-hover-title], [data-hover-text], [title]") ?? null;
  const close = () => {
    active = null;
    card.hide();
  };
  const open = (el) => {
    if (el === active) return;
    adoptTitle(el);
    if (!hoverInfoOf(el)) return;
    active = el;
    card.show(() => hoverInfoOf(el), el);
  };
  const onOver = (e) => {
    const el = find(e.target);
    if (!el) {
      if (active) close();
      return;
    }
    open(el);
  };
  doc.addEventListener("mouseover", onOver);
  doc.addEventListener("mouseout", (e) => {
    if (active && !active.contains?.(e.relatedTarget)) close();
  });
  doc.addEventListener("focusin", (e) => {
    const el = find(e.target);
    if (el) open(el);
  });
  doc.addEventListener("focusout", close);
  doc.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  // A press on the element the card describes keeps the card (it is re-read after the click, because the button may have changed, e.g. Play to Pause);
  // a press anywhere else closes it. A card of an element that the click took away from the page closes.
  doc.addEventListener("pointerdown", (e) => {
    if (active && active.contains?.(e.target)) return;
    close();
  });
  doc.addEventListener("click", () => {
    const el = active;
    if (!el) return;
    setTimeout(() => {
      if (active !== el) return;
      if (!el.isConnected) {
        close();
        return;
      }
      active = null;
      card.hide();
      open(el);
    }, 0);
  });
  doc.addEventListener("scroll", close, true);
  return { card, close };
}
