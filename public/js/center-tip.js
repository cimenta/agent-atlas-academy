// A tooltip shown in the middle of the screen. It goes away on a click, on Escape, or after a while.
// The same message is always also on the page, so the tip is hidden from screen readers.
import { h } from "./dom.js";

export const CENTER_TIP_MS = 8000;

export function showCenterTip({ doc, content, ms = CENTER_TIP_MS, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const tip = h(doc, "div", { class: "center-tip", "data-ui": "center-tip", "aria-hidden": "true" }, content);
  let timer;
  const close = () => {
    clearTimer(timer);
    doc.removeEventListener("keydown", onKey);
    doc.removeEventListener("pointerdown", close);
    tip.remove();
  };
  function onKey(event) {
    if (event.key === "Escape") close();
  }
  doc.body.append(tip);
  doc.addEventListener("keydown", onKey);
  doc.addEventListener("pointerdown", close);
  timer = setTimer(close, ms);
  return { close, element: tip };
}
