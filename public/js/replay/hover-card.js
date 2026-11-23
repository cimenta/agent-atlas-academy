// A card that explains an element when the pointer rests on it (after a short pause, so it never gets in the way).
// The card sits on the page (fixed), so scrolling boxes cannot cut it off. Its content is read from get() each time,
// so an open card follows the state of the player as it plays: call refresh() after the state changed.
import { h } from "../dom.js";

const realClock = { setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: (id) => globalThis.clearTimeout(id) };

export function createHoverCard({ doc, clock = realClock, delayMs = 250 }) {
  let card = null;
  let timer = null;
  let current = null; // { get, line }
  const children = (info) => {
    const rows = (info.rows ?? []).filter(Boolean);
    return [h(doc, "h4", {}, info.title, info.badge ? h(doc, "span", { class: "hover-badge" }, info.badge) : ""), ...(info.text ? [h(doc, "p", {}, info.text)] : []), ...(info.extra ? [h(doc, "p", { class: "hover-extra" }, info.extra)] : []), ...(rows.length ? [h(doc, "dl", {}, ...rows.flatMap(([k, v]) => [h(doc, "dt", {}, k), h(doc, "dd", {}, v)]))] : [])];
  };
  function hide() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
    if (card) card.remove();
    card = null;
    current?.line?.classList.remove("hot");
    current = null;
  }
  function refresh() {
    if (!card || !current) return;
    const info = current.get();
    if (info) card.replaceChildren(...children(info));
  }
  // get() gives { title, badge?, text?, extra?, rows? }; line (optional) is an arrow that is lit while the card is open.
  function show(get, anchor, line = null) {
    if (timer !== null) clock.clearTimeout(timer);
    timer = clock.setTimeout(() => {
      timer = null;
      if (card) card.remove();
      const info = get();
      if (!info) return;
      current = { get, line };
      const el = h(doc, "div", { class: "hover-card", role: "tooltip", "data-ui": "diagram-card" }, ...children(info));
      (doc.body ?? anchor).append(el);
      card = el;
      line?.classList.add("hot");
      const rect = anchor.getBoundingClientRect?.();
      if (rect && el.style) {
        const vw = doc.defaultView?.innerWidth ?? 1024;
        const w = el.offsetWidth || 260;
        const tall = el.offsetHeight || 120;
        const above = rect.top - tall - 10;
        el.style.left = `${Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, vw - w - 8))}px`;
        el.style.top = `${above >= 8 ? above : rect.bottom + 10}px`;
      }
    }, delayMs);
  }
  // Makes the element open the card on hover and on keyboard focus.
  function attach(el, get) {
    el.addEventListener("mouseenter", () => show(get, el));
    el.addEventListener("focus", () => show(get, el));
    el.addEventListener("mouseleave", hide);
    el.addEventListener("blur", hide);
  }
  return { show, hide, refresh, attach, litLine: () => current?.line ?? null };
}
