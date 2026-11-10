// Search inside a long text: marks every match, shows how many there are and steps through them.
import { h } from "./dom.js";

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Where a query occurs in a text, ignoring case. Pure, so it can be tested without a page.
export function findMatches(text, query) {
  const q = String(query ?? "");
  if (!q) return [];
  const found = [];
  const re = new RegExp(escapeRegExp(q), "gi");
  let m;
  while ((m = re.exec(String(text)))) found.push({ start: m.index, end: m.index + m[0].length });
  return found;
}

// Wraps every match under root in <mark> and returns the marks. Only text nodes are touched.
export function markText(doc, root, query) {
  if (!query) return [];
  const walker = doc.createTreeWalker(root, 4); // 4 = show text nodes only
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const marks = [];
  for (const node of nodes) {
    const text = node.nodeValue;
    const matches = findMatches(text, query);
    if (matches.length === 0) continue;
    const fragment = doc.createDocumentFragment();
    let last = 0;
    for (const { start, end } of matches) {
      if (start > last) fragment.append(doc.createTextNode(text.slice(last, start)));
      const mark = doc.createElement("mark");
      mark.textContent = text.slice(start, end);
      fragment.append(mark);
      marks.push(mark);
      last = end;
    }
    if (last < text.length) fragment.append(doc.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(fragment, node);
  }
  return marks;
}

// The search box with a match counter and previous/next buttons. apply(query) must redraw the
// text with the matches marked and return the marks.
export function searchBar({ doc, t, value = "", apply, placeholder, ui = "text-search" }) {
  let marks = [];
  let current = 0;
  const input = h(doc, "input", { class: "vq", type: "search", placeholder: placeholder ?? t("insp.vSearch"), "aria-label": placeholder ?? t("insp.vSearch"), autocomplete: "off" });
  input.value = value;
  const count = h(doc, "span", { class: "vc", "aria-live": "polite" });
  const prev = h(doc, "button", { type: "button", class: "icon-button", title: t("search.prev"), "aria-label": t("search.prev") }, "↑");
  const next = h(doc, "button", { type: "button", class: "icon-button", title: t("search.next"), "aria-label": t("search.next") }, "↓");

  const show = (scroll) => {
    marks.forEach((m, i) => m.setAttribute("class", i === current ? "cur" : ""));
    const q = input.value.trim();
    count.textContent = marks.length ? t("search.count", { n: current + 1, total: marks.length }) : q ? t("search.none") : "";
    prev.disabled = next.disabled = marks.length < 2;
    if (scroll && marks[current]) {
      // A match inside a closed JSON branch is opened first, so it can be seen.
      for (let n = marks[current].parentElement; n; n = n.parentElement) if (n.tagName === "DETAILS") n.open = true;
      marks[current].scrollIntoView?.({ block: "center" });
    }
  };
  const run = (scroll) => {
    marks = apply(input.value.trim());
    current = 0;
    show(scroll);
  };
  const step = (delta) => {
    if (marks.length === 0) return;
    current = (current + delta + marks.length) % marks.length;
    show(true);
  };
  input.addEventListener("input", () => run(true));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
    }
  });
  prev.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  const element = h(doc, "div", { class: "search-bar noprint", "data-ui": ui }, input, prev, next, count);
  return { element, run: () => run(false), query: () => input.value.trim() };
}
