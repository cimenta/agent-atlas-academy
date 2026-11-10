// A box for long text and JSON: a collapsible tree or raw text, and a search that marks matches.
// Each viewer keeps its own mode and query, keyed by an id the caller chooses.
import { h } from "../dom.js";
import { searchBar } from "../text-search.js";

function tryJson(value) {
  if (value && typeof value === "object") return value;
  if (typeof value !== "string" || !/^\s*[[{]/.test(value)) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function createViewer({ doc, t }) {
  const states = new Map(); // id -> { mode, q }

  // Text with the matches wrapped in <mark>, as nodes.
  function marked(text, q) {
    const value = String(text);
    if (!q) return [doc.createTextNode(value)];
    return value.split(new RegExp(`(${escapeRegExp(q)})`, "i")).map((part, i) => (i % 2 ? h(doc, "mark", {}, part) : doc.createTextNode(part)));
  }

  function leaf(value, q) {
    if (value === null) return h(doc, "span", { class: "j-n" }, "null");
    const type = typeof value;
    if (type === "string") return h(doc, "span", { class: "j-string" }, doc.createTextNode('"'), ...marked(value, q), doc.createTextNode('"'));
    return h(doc, "span", { class: `j-${type}` }, ...marked(value, q));
  }

  function tree(value, q, depth = 0) {
    if (value === null || typeof value !== "object") return leaf(value, q);
    const isArray = Array.isArray(value);
    const entries = isArray ? value.map((x, i) => [i, x]) : Object.entries(value);
    if (entries.length === 0) return doc.createTextNode(isArray ? "[]" : "{}");
    const open = depth < 2 || (q && JSON.stringify(value).toLowerCase().includes(q.toLowerCase()));
    const rows = entries.map(([key, child]) =>
      h(doc, "div", {}, h(doc, "span", { class: "j-k" }, ...(isArray ? [String(key)] : marked(key, q))), ": ", tree(child, q, depth + 1)),
    );
    return h(doc, "details", { open }, h(doc, "summary", {}, isArray ? `[${entries.length}]` : `{${entries.length}}`), h(doc, "div", { class: "jk" }, ...rows));
  }

  return {
    view(id, value) {
      if (!states.has(id)) states.set(id, { mode: "raw", q: "" });
      const st = states.get(id);
      const json = tryJson(value);
      const raw = json !== undefined ? JSON.stringify(json, null, 2) : String(value ?? "");
      const bodyBox = h(doc, "div", { class: "pre vbody" });
      const fillBody = () => {
        bodyBox.replaceChildren(...(json !== undefined && st.mode === "tree" ? [h(doc, "div", { class: "jt" }, tree(json, st.q))] : marked(raw, st.q)));
      };
      let search = null;
      const redraw = () => (search ? search.run() : fillBody());
      const bar = h(doc, "div", { class: "vbar" });
      if (json !== undefined) {
        const seg = h(doc, "span", { class: "vseg" });
        for (const mode of ["tree", "raw"]) {
          const button = h(doc, "button", { type: "button", class: st.mode === mode ? "sel" : "", "data-vm": mode }, t(mode === "tree" ? "insp.vTree" : "insp.vRaw"));
          button.addEventListener("click", () => {
            st.mode = mode;
            for (const b of seg.children) b.className = b.getAttribute("data-vm") === mode ? "sel" : "";
            redraw();
          });
          seg.append(button);
        }
        bar.append(seg);
      }
      if (raw.length > 200 || st.q) {
        search = searchBar({
          doc,
          t,
          value: st.q,
          apply: (q) => {
            st.q = q;
            fillBody();
            return [...bodyBox.querySelectorAll("mark")];
          },
        });
        bar.append(search.element);
      }
      redraw();
      return h(doc, "div", { class: "viewer", "data-ui": "output-viewer" }, bar.children.length ? bar : "", bodyBox);
    },
  };
}
