// Builds DOM elements without HTML strings. Text always becomes a text node.
export function h(doc, tag, attrs = {}, ...children) {
  const el = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) el.append(typeof child === "string" ? doc.createTextNode(child) : child);
  return el;
}
