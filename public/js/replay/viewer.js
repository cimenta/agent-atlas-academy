// A box for long text and JSON: a collapsible tree or raw text, and a search that marks matches.
// Each viewer keeps its own mode and query, keyed by an id the caller chooses.
import { h } from "../dom.js";

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

// JSON.stringify that does not throw for a document nested too deep to print: the fallback text is returned instead.
export function safeStringify(json, fallback) {
  try {
    return JSON.stringify(json, null, 2);
  } catch {
    return fallback;
  }
}

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

  // The keyboard in a tree: a click makes the tree the active part (it takes the focus), and then the arrows move between its folds,
  // Right opens a fold and Left closes it (or goes to the fold above), Home and End go to the first and the last fold.
  function treeKeys(box) {
    const visible = () => [...box.querySelectorAll("summary")].filter((sm) => {
      for (let d = sm.parentElement; d && d !== box; d = d.parentElement) if (d.tagName === "DETAILS" && d !== sm.parentElement && !d.open) return false;
      return true;
    });
    box.addEventListener("keydown", (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const keys = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"];
      if (!keys.includes(event.key)) return;
      const list = visible();
      if (list.length === 0) return;
      const at = list.indexOf(doc.activeElement);
      const go = (i) => list[Math.max(0, Math.min(list.length - 1, i))]?.focus();
      event.preventDefault();
      event.stopPropagation();
      if (at < 0) return go(event.key === "End" ? list.length - 1 : 0);
      const fold = list[at].parentElement;
      if (event.key === "ArrowDown") go(at + 1);
      else if (event.key === "ArrowUp") go(at - 1);
      else if (event.key === "Home") go(0);
      else if (event.key === "End") go(list.length - 1);
      else if (event.key === "ArrowRight") {
        if (!fold.open) fold.open = true;
        else go(at + 1);
      } else if (fold.open) fold.open = false;
      else {
        const parent = fold.parentElement?.closest("details");
        if (parent) parent.querySelector(":scope > summary")?.focus();
      }
    });
  }

  return {
    view(id, value) {
      if (!states.has(id)) states.set(id, { mode: "raw", q: "" });
      const st = states.get(id);
      const json = tryJson(value);
      const raw = json !== undefined ? safeStringify(json, String(value ?? "")) : String(value ?? "");
      const bodyBox = h(doc, "div", { class: "pre vbody" });
      const fillBody = () => {
        let nodes;
        try {
          if (json !== undefined && st.mode === "tree") {
            const box = h(doc, "div", { class: "jt", tabindex: "0", role: "tree", "aria-label": t("insp.vTree") }, tree(json, st.q));
            treeKeys(box);
            nodes = [box];
          } else nodes = marked(raw, st.q);
        } catch {
          nodes = marked(raw, st.q); // a tree of a document nested too deep
        }
        bodyBox.replaceChildren(...nodes);
      };
      const redraw = fillBody;
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
      redraw();
      return h(doc, "div", { class: "viewer", "data-ui": "output-viewer" }, bar.children.length ? bar : "", bodyBox);
    },
  };
}
