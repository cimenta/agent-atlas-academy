// A tooltip shown in the middle of the screen. It goes away on a click outside it, on Escape, or after a while.
// A sticky tip does not go away by itself: it stays until the visitor closes it (button, Escape or a click outside).
// The same message is always also on the page. A link inside the tip stays usable: only a press
// outside the tip closes it, and following a link closes it too.
import { h } from "./dom.js";

export const CENTER_TIP_MS = 8000;

export function showCenterTip({ doc, content, ms = CENTER_TIP_MS, sticky = false, closeLabel = "Close", setTimer = setTimeout, clearTimer = clearTimeout }) {
  const closeButton = sticky ? h(doc, "button", { type: "button", class: "center-tip-close", "data-ui": "center-tip-close" }, closeLabel) : "";
  const tip = h(doc, "div", { class: sticky ? "center-tip sticky" : "center-tip", "data-ui": "center-tip" }, content, closeButton);
  let timer;
  const close = () => {
    clearTimer(timer);
    doc.removeEventListener("keydown", onKey);
    doc.removeEventListener("pointerdown", onPress);
    tip.remove();
  };
  function onKey(event) {
    if (event.key === "Escape") close();
  }
  function onPress(event) {
    if (!tip.contains?.(event.target)) close();
  }
  tip.addEventListener("click", (event) => {
    if (event.target?.tagName === "A" || event.target === closeButton) close();
  });
  doc.body.append(tip);
  doc.addEventListener("keydown", onKey);
  doc.addEventListener("pointerdown", onPress);
  if (!sticky) timer = setTimer(close, ms);
  return { close, element: tip };
}
