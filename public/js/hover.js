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
  let muted = null; // data-ui of an element whose card a click closed: it stays shut until the pointer has been elsewhere (the button may be drawn again under the pointer)
  const keyOf = (el) => el?.getAttribute?.("data-ui") ?? null;
  const find = (target) => target?.closest?.("[data-hover-title], [data-hover-text], [title]") ?? null;
  const close = () => {
    active = null;
    card.hide();
  };
  const open = (el) => {
    if (el === active) return;
    if (muted && keyOf(el) === muted) return;
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
  // The card of a clicked template button stays shut until the pointer really moves away from it. A mouseover that the browser sends after the page was
  // drawn again (with no movement) does not count, so only a pointer move clears the mute.
  doc.addEventListener("pointermove", (e) => {
    if (muted && keyOf(e.target?.closest?.(`[data-ui="${muted}"]`)) !== muted) muted = null;
  });
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
  // An element with data-hover-close-on-click (the template buttons) takes its card away with the click. This runs before the click handler of the
  // button itself (capture), because that handler may draw the button again and the card would be lost track of.
  doc.addEventListener(
    "click",
    (e) => {
      const el = e.target?.closest?.("[data-hover-close-on-click]");
      if (el) {
        muted = keyOf(el);
        close();
      }
    },
    true,
  );
  doc.addEventListener("click", () => {
    const el = active;
    if (!el) return;
    // A button that is drawn again by its click (the corner buttons of the diagram) is found again by its data-ui or data-focus-key.
    const key = ["data-ui", "data-focus-key"].map((n) => [n, el.getAttribute?.(n)]).find(([, v]) => v);
    setTimeout(() => {
      if (active !== el && active !== null) return; // another element took over meanwhile
      if (!el.isConnected) {
        const again = key ? doc.querySelector(`[${key[0]}="${key[1]}"]`) : null;
        close();
        if (again) open(again);
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
