// Redraws a part of the page and gives the focus back to the control that had it (found by id, data-ui or data-tab).
export function keepFocus(doc, host, redraw) {
  const el = host.contains?.(doc.activeElement) ? doc.activeElement : null;
  const attr = (n) => el?.getAttribute?.(n);
  const key = el ? (el.id ? `#${el.id}` : attr("data-ui") ? `[data-ui="${attr("data-ui")}"]` : attr("data-tab") ? `[data-tab="${attr("data-tab")}"]` : null) : null;
  redraw();
  if (key) host.querySelector?.(key)?.focus?.();
}
