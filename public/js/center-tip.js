// A tooltip shown in the middle of the screen. It goes away on a click outside it, on Escape, or after a while.
// A sticky tip does not go away by itself: it stays until the visitor closes it (button, Escape or a click outside).
// The same message is always also on the page. A link inside the tip stays usable: only a press
// outside the tip closes it, and following a link closes it too.
import { h } from "./dom.js";

export const CENTER_TIP_MS = 8000;

// Where the tip's top left corner goes while it is dragged: the pointer minus where it grabbed the tip,
// kept inside the window so the tip can never be lost off screen.
export function dragPosition({ pointer, grab, size, viewport }) {
  const clamp = (value, max) => Math.max(0, Math.min(value, Math.max(0, max)));
  return { left: clamp(pointer.x - grab.x, viewport.width - size.width), top: clamp(pointer.y - grab.y, viewport.height - size.height) };
}

export function showCenterTip({ doc, content, ms = CENTER_TIP_MS, sticky = false, closeLabel = "Close", moveLabel = "Drag to move", setTimer = setTimeout, clearTimer = clearTimeout }) {
  const closeButton = sticky ? h(doc, "button", { type: "button", class: "center-tip-close", "data-ui": "center-tip-close" }, closeLabel) : "";
  // The grip at the top moves the tip aside, so what is behind it can be read.
  const grip = h(doc, "div", { class: "center-tip-grip", "data-ui": "center-tip-grip", title: moveLabel, "aria-hidden": "true" }, h(doc, "span", { class: "center-tip-dots" }, "\u22EE\u22EE"), moveLabel);
  const tip = h(doc, "div", { class: sticky ? "center-tip sticky" : "center-tip", "data-ui": "center-tip" }, grip, content, closeButton);
  let drag = null;
  grip.addEventListener("pointerdown", (event) => {
    const box = tip.getBoundingClientRect();
    drag = { grab: { x: event.clientX - box.left, y: event.clientY - box.top }, size: { width: box.width, height: box.height } };
    tip.setAttribute("class", `${tip.getAttribute("class")} moved`.replace(" moved moved", " moved"));
    event.preventDefault();
  });
  const onMove = (event) => {
    if (!drag) return;
    const view = doc.defaultView;
    const at = dragPosition({ pointer: { x: event.clientX, y: event.clientY }, grab: drag.grab, size: drag.size, viewport: { width: view.innerWidth, height: view.innerHeight } });
    tip.style.setProperty("left", `${at.left}px`);
    tip.style.setProperty("top", `${at.top}px`);
  };
  const onUp = () => {
    drag = null;
  };
  doc.addEventListener("pointermove", onMove);
  doc.addEventListener("pointerup", onUp);
  let timer;
  const close = () => {
    clearTimer(timer);
    doc.removeEventListener("keydown", onKey);
    doc.removeEventListener("pointerdown", onPress);
    doc.removeEventListener("pointermove", onMove);
    doc.removeEventListener("pointerup", onUp);
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
