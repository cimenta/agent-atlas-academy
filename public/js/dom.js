// Builds DOM elements without HTML strings. Text always becomes a text node.
//
// The site's Content Security Policy has style-src 'self' and no unsafe-inline, so a style="..." attribute is dropped by the browser
// (this also holds for setAttribute("style", ...)). Styles set one property at a time through the element's style object are allowed,
// so a style attribute given here is split into properties and applied that way.

// "left:10%;background:linear-gradient(a,b)" becomes [["left","10%"],["background","linear-gradient(a,b)"]]. A ; inside brackets or quotes stays.
export function parseStyle(text) {
  const out = [];
  let depth = 0;
  let quote = "";
  let start = 0;
  const push = (end) => {
    const part = text.slice(start, end);
    const at = part.indexOf(":");
    if (at > 0 && part.slice(0, at).trim() !== "") out.push([part.slice(0, at).trim(), part.slice(at + 1).trim()]);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      push(i);
      start = i + 1;
    }
  }
  push(text.length);
  return out;
}

export function setStyle(el, text) {
  if (typeof el.style?.setProperty !== "function") {
    el.setAttribute("style", text); // not a browser element (a test double)
    return;
  }
  for (const [name, value] of parseStyle(text)) el.style.setProperty(name, value);
}

export function h(doc, tag, attrs = {}, ...children) {
  const el = doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "style" && typeof value === "string") setStyle(el, value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) el.append(typeof child === "string" ? doc.createTextNode(child) : child);
  return el;
}
