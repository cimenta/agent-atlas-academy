// The Library help window: five sections (the card, the colour, the level, pairs, compare) with the real cards and frames of the Library.
// It opens from a button next to the tabs of the right side, and by itself when the Library is opened (once in a browser session) until the
// student ticks "Do not show again" (the same switch is in Settings).
import { h } from "./dom.js";
import { runRow, pairFrame } from "./play-shared.js";
import { groupPairs } from "./library-path.js";

export const HELP_TABS = ["card", "color", "level", "pairs", "compare"];
const SVG = "http://www.w3.org/2000/svg";
const SEEN_KEY = "aa.libraryHelpSeen";
// The parts of a card the help points at, in the order of the legend.
export const CARD_PARTS = ["title", "type", "prov1", "prov2", "bg", "tick", "kind", "step", "level"];

const sessionStore = (ctx) => {
  try {
    return ctx.doc.defaultView?.sessionStorage ?? null;
  } catch {
    return null;
  }
};

// The window opens by itself when the setting is on and it has not opened yet in this browser session.
export function helpWanted(ctx) {
  if (ctx.settings?.get?.().libraryHelp === false) return false;
  try {
    return sessionStore(ctx)?.getItem(SEEN_KEY) !== "1";
  } catch {
    return true;
  }
}
export function markHelpSeen(ctx) {
  try {
    sessionStore(ctx)?.setItem(SEEN_KEY, "1");
  } catch {
    // opening again next time is harmless
  }
}

// A text with {done} in it, the marker replaced by the node.
function rich(doc, text, nodes) {
  const out = [];
  for (const part of String(text).split(/(\{done\})/)) {
    if (part === "{done}") out.push(nodes.done());
    else if (part !== "") out.push(part);
  }
  return out;
}

export function createLibraryHelp(ctx, getItems = () => []) {
  const { doc, t } = ctx;
  let root = null;
  let page = 0;
  let opener = null;
  let ticked = new Set();

  const dots = (level) => h(doc, "span", { class: `lv-dots l${level}`, role: "img", "aria-label": t("path.level.label", { level: t(`path.level.${level}`) }) }, ...[1, 2, 3].map((n) => h(doc, "i", { class: n <= level ? "on" : undefined })));
  const stepIcon = (n, done) => h(doc, "span", { class: `step-icon${done ? " done" : ""}`, "data-ui": done ? "help-step-done" : "help-step" }, done ? `✓ ${n}` : String(n));
  const sample = (n, extra = {}) => ({ id: `help-sample-${n}`, title: t(`libhelp.sample.${n}`), pattern: "sequential", provider: "cloudflare", outcome: "finished", level: 1, ...extra });
  const row = (item, pick = {}) => runRow(ctx, item, { checked: false, base: false, selected: false, onToggle() {}, onSelect() {}, ...pick });
  const cardList = (...rows) => h(doc, "ul", { class: "run-list lh-list" }, ...rows);
  const demoBox = (...children) => h(doc, "div", { class: "library-pane help-lib" }, ...children);

  // ---- the card, with a line from each part to its words ----
  function cardPanel() {
    const item = sample(2, { pattern: "supervisor", provider: "anthropic+groq", outcome: "stopped_limit", level: 2, kind: "pair" });
    const card = row(item, { step: { n: 3, done: false }, goal: "save" });
    const text = (key) => ({ name: t(`libhelp.p.${key}.t`), body: t(`libhelp.p.${key}.d`) });
    const labels = CARD_PARTS.map((key) => {
      const { name, body } = text(key);
      return h(doc, "div", { class: `lh-lab lh-k-${key}`, "data-ui": `help-label-${key}`, "data-part": key }, h(doc, "b", {}, name), " ", ...rich(doc, body, { done: () => stepIcon(3, true) }));
    });
    const svg = doc.createElementNS(SVG, "svg");
    svg.setAttribute("class", "lh-lines");
    svg.setAttribute("aria-hidden", "true");
    const demo = h(doc, "div", { class: "lh-card", "data-ui": "help-card" }, h(doc, "div", { class: "library-pane help-lib lh-card-row" }, cardList(card)), svg, ...labels);
    demo.layout = () => layoutCard(demo);
    return [h(doc, "p", { class: "lh-lead" }, t("libhelp.card.lead")), demo];
  }

  function layoutCard(demo) {
    if (typeof demo.getBoundingClientRect !== "function" || typeof demo.querySelector !== "function") return;
    const svg = demo.querySelector(".lh-lines");
    const cardEl = demo.querySelector(".run-row");
    if (!svg || !cardEl) return;
    svg.replaceChildren();
    const labs = [...demo.querySelectorAll(".lh-lab")];
    const wide = demo.clientWidth >= 560;
    demo.classList.toggle("lh-narrow", !wide);
    for (const lab of labs) {
      lab.style.top = "";
      lab.style.left = "";
      lab.style.width = "";
      lab.style.textAlign = "";
    }
    demo.style.minHeight = "";
    if (!wide) return;
    const dr = demo.getBoundingClientRect();
    const rect = (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left - dr.left, right: r.right - dr.left, top: r.top - dr.top, bottom: r.bottom - dr.top, width: r.width, height: r.height };
    };
    const card = rect(cardEl);
    const chips = [...cardEl.querySelectorAll(".provider-chip")];
    const part = {
      title: cardEl.querySelector(".run-title"),
      type: cardEl.querySelector('[data-ui="run-type"]'),
      tick: cardEl.querySelector('[data-ui="compare-select"]'),
      kind: cardEl.querySelector('[data-ui="run-kind"]'),
      step: cardEl.querySelector('[data-ui="run-step"]'),
      level: cardEl.querySelector('[data-ui="run-level"]'),
    };
    const labOf = (key) => demo.querySelector(`[data-part="${key}"]`);
    const line = (d, key, dot) => {
      const path = doc.createElementNS(SVG, "path");
      path.setAttribute("d", d);
      path.setAttribute("class", `lh-line lh-k-${key}`);
      svg.append(path);
      const circle = doc.createElementNS(SVG, "circle");
      circle.setAttribute("cx", String(dot[0]));
      circle.setAttribute("cy", String(dot[1]));
      circle.setAttribute("r", "3.2");
      circle.setAttribute("class", `lh-dot lh-k-${key}`);
      svg.append(circle);
    };
    let need = card.bottom;
    const place = (side, keys) => {
      const items = keys.filter((k) => labOf(k)).map((key) => {
        let anchor;
        if (key === "bg") anchor = { x: card.left + 14, y: card.top + card.height * 0.5 };
        else if (key === "title") anchor = { x: rect(part.title).left, y: rect(part.title).top + 10 };
        else if (key === "type") anchor = { x: rect(part.type).left, y: rect(part.type).top + rect(part.type).height / 2 };
        else {
          const r = rect(part[key]);
          anchor = { x: r.right, y: r.top + r.height / 2 };
        }
        return { key, anchor };
      }).sort((a, b) => a.anchor.y - b.anchor.y);
      let y = 0;
      for (const it of items) {
        const lab = labOf(it.key);
        lab.style.width = "130px";
        lab.style.textAlign = side === "left" ? "right" : "left";
        lab.style.left = `${side === "left" ? 0 : dr.width - 130}px`;
        const top = Math.max(y, it.anchor.y - 10);
        lab.style.top = `${top}px`;
        y = top + lab.offsetHeight + 10;
        need = Math.max(need, y);
        const ex = side === "left" ? 130 + 6 : dr.width - 130 - 6;
        const ey = top + 10;
        const dx = side === "left" ? 30 : -30;
        line(`M${it.anchor.x} ${it.anchor.y} C ${it.anchor.x + dx} ${it.anchor.y}, ${ex - dx} ${ey}, ${ex} ${ey}`, it.key, [it.anchor.x, it.anchor.y]);
      }
    };
    place("left", ["title", "bg", "type"]);
    place("right", ["tick", "kind", "step", "level"]);
    // the providers: a straight line down from each chip to its words under the card
    chips.slice(0, 2).forEach((chip, i) => {
      const lab = labOf(`prov${i + 1}`);
      if (!lab) return;
      const r = rect(chip);
      const cx = r.left + r.width / 2;
      const top = card.bottom + 22;
      lab.style.width = "130px";
      lab.style.textAlign = i === 0 ? "right" : "left";
      lab.style.left = `${i === 0 ? Math.max(150, cx - 130) : cx}px`;
      lab.style.top = `${top}px`;
      line(`M${cx} ${r.bottom} L ${cx} ${top - 2}`, `prov${i + 1}`, [cx, r.bottom]);
      need = Math.max(need, top + lab.offsetHeight);
    });
    demo.style.minHeight = `${need + 8}px`;
  }

  // ---- colour ----
  function colorPanel() {
    const kinds = [["ok", "finished"], ["warn", "stopped_limit"], ["fail", "failed"]];
    return [
      h(doc, "p", { class: "lh-lead" }, t("libhelp.color.lead")),
      ...kinds.map(([key, outcome], i) => h(doc, "div", { class: "lh-item", "data-ui": `help-color-${key}` }, demoBox(cardList(row(sample(i + 1, { outcome, level: 1 })))), h(doc, "p", { class: "lh-say" }, h(doc, "b", {}, t(`libhelp.color.${key}.t`)), ": ", t(`libhelp.color.${key}.d`)))),
    ];
  }

  // ---- level and step ----
  function levelPanel() {
    return [
      h(doc, "p", { class: "lh-lead" }, t("libhelp.level.lead")),
      h(doc, "div", { class: "lh-levels" },
        ...[1, 2, 3].map((n) => h(doc, "div", { class: "lh-lv", "data-ui": `help-level-${n}` }, dots(n), h(doc, "span", {}, h(doc, "b", {}, t(`path.level.${n}`)), ": ", t(`libhelp.level.${n}.d`)))),
        h(doc, "div", { class: "lh-lv", "data-ui": "help-level-step" }, stepIcon(3, false), h(doc, "span", {}, t("libhelp.level.step"))),
        h(doc, "div", { class: "lh-lv", "data-ui": "help-level-done" }, stepIcon(3, true), h(doc, "span", {}, ...rich(doc, t("libhelp.level.done"), { done: () => stepIcon(3, true) })))),
    ];
  }

  // ---- pairs: the real frames of the library, with the real box on the question mark ----
  function pairsPanel() {
    const grouped = groupPairs(Array.isArray(getItems()) ? getItems() : []);
    const pair = grouped.find((e) => e.pair)?.pair ?? [sample(1, { id: "help-pair-a", kind: "pair", twin: "help-pair-b", level: 1 }), sample(1, { id: "help-pair-b", kind: "pair", twin: "help-pair-a", level: 1 })];
    const trio = grouped.find((e) => e.trio)?.trio ?? ["a", "b", "c"].map((x) => sample(1, { id: `help-trio-${x}`, kind: "trio", with: ["a", "b", "c"].filter((y) => y !== x).map((y) => `help-trio-${y}`), level: 1 }));
    const frame = (members) => demoBox(h(doc, "ul", { class: "run-list lh-list" }, pairFrame(ctx, members, (item) => row(item), { idPrefix: "help-tip" })));
    return [
      h(doc, "p", { class: "lh-lead" }, t("libhelp.pairs.lead")),
      h(doc, "div", { class: "lh-twoc" },
        h(doc, "div", { class: "lh-item-col", "data-ui": "help-pair" }, frame(pair), h(doc, "p", { class: "lh-say" }, t("libhelp.pairs.pair"))),
        h(doc, "div", { class: "lh-item-col", "data-ui": "help-trio" }, frame(trio), h(doc, "p", { class: "lh-say" }, t("libhelp.pairs.trio")))),
    ];
  }

  // ---- compare ----
  function comparePanel() {
    const go = h(doc, "button", { type: "button", class: "lh-go", "data-ui": "help-compare-go" });
    const note = h(doc, "span", { class: "lh-say", "data-ui": "help-compare-note", role: "status" });
    const refresh = () => {
      const n = ticked.size;
      go.textContent = t("libhelp.compare.go", { n });
      go.disabled = n < 2;
      note.textContent = t(n < 2 ? "libhelp.compare.few" : "libhelp.compare.ok");
    };
    const rows = [1, 2, 3].map((n) => row(sample(n, { outcome: ["finished", "stopped_limit", "failed"][n - 1], level: n }), {
      checked: ticked.has(n),
      onToggle: (on) => {
        if (on) ticked.add(n);
        else ticked.delete(n);
        refresh();
      },
    }));
    refresh();
    return [h(doc, "p", { class: "lh-lead" }, t("libhelp.compare.lead")), demoBox(cardList(...rows)), h(doc, "div", { class: "lh-cmp" }, go, note)];
  }

  const PANELS = { card: cardPanel, color: colorPanel, level: levelPanel, pairs: pairsPanel, compare: comparePanel };

  // ---- the window ----
  function draw() {
    if (!root) return;
    const name = HELP_TABS[page];
    const tabs = root.tabs;
    tabs.replaceChildren(...HELP_TABS.map((key, i) => {
      const button = h(doc, "button", { type: "button", class: "lh-tab", role: "tab", id: `lh-tab-${key}`, "data-ui": `help-tab-${key}`, "aria-selected": String(i === page), "aria-controls": "lh-panel", tabindex: i === page ? "0" : "-1" }, h(doc, "span", { class: "lh-tab-ic", "aria-hidden": "true" }, ["▭", "◐", "●●", "⇄", "☑"][i]), t(`libhelp.tab.${key}`));
      button.addEventListener("click", () => go(i, true));
      return button;
    }));
    const panel = root.panel;
    panel.setAttribute("aria-labelledby", `lh-tab-${name}`);
    panel.replaceChildren(h(doc, "h3", { class: "lh-h" }, t(`libhelp.tab.${name}`)), ...PANELS[name]());
    root.back.disabled = page === 0;
    root.next.textContent = t(page === HELP_TABS.length - 1 ? "libhelp.done" : "libhelp.next");
    if (panel.scrollTop !== undefined) panel.scrollTop = 0;
    const lay = () => [...(panel.querySelectorAll?.(".lh-card") ?? [])].forEach((el) => el.layout?.());
    lay();
    doc.defaultView?.requestAnimationFrame?.(lay);
  }
  function go(i, focus = false) {
    page = Math.max(0, Math.min(HELP_TABS.length - 1, i));
    draw();
    if (focus) root?.tabs.querySelector?.('[aria-selected="true"]')?.focus();
  }
  const onKey = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key !== "Tab" || !root?.modal?.querySelectorAll) return;
    const focusable = [...root.modal.querySelectorAll("button:not([disabled]), input, a[href], [tabindex='0']")].filter((el) => el.tabIndex >= 0);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && doc.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && doc.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };
  const onResize = () => [...(root?.panel.querySelectorAll?.(".lh-card") ?? [])].forEach((el) => el.layout?.());

  function open() {
    if (root) return;
    if (!doc.body?.append) return;
    opener = doc.activeElement ?? null;
    page = 0;
    ticked = new Set();
    const closeButton = h(doc, "button", { type: "button", class: "lh-close", "data-ui": "help-close", "aria-label": t("libhelp.close"), title: t("libhelp.close") }, "×");
    closeButton.addEventListener("click", close);
    const tabs = h(doc, "div", { class: "lh-tabs", role: "tablist", "aria-orientation": "vertical", "aria-label": t("libhelp.sections"), "data-ui": "help-tabs" });
    tabs.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      go(page + (event.key === "ArrowDown" ? 1 : -1), true);
    });
    const panel = h(doc, "div", { class: "lh-panel", role: "tabpanel", id: "lh-panel", "data-ui": "help-panel", tabindex: "0" });
    const never = h(doc, "input", { type: "checkbox", id: "lh-never", "data-ui": "help-never" });
    never.checked = ctx.settings?.get?.().libraryHelp === false;
    never.addEventListener("change", () => ctx.settings?.setLibraryHelp?.(!never.checked));
    const back = h(doc, "button", { type: "button", class: "lh-back", "data-ui": "help-back" }, t("libhelp.back"));
    back.addEventListener("click", () => go(page - 1));
    const next = h(doc, "button", { type: "button", class: "lh-next", "data-ui": "help-next" });
    next.addEventListener("click", () => (page === HELP_TABS.length - 1 ? close() : go(page + 1)));
    const modal = h(doc, "div", { class: "lh-modal" },
      h(doc, "div", { class: "lh-head" }, h(doc, "h2", { id: "lh-title" }, t("libhelp.title")), closeButton),
      h(doc, "div", { class: "lh-main" }, tabs, panel),
      h(doc, "div", { class: "lh-foot" }, h(doc, "span", { class: "lh-never" }, never, h(doc, "label", { for: "lh-never" }, t("libhelp.never")), h(doc, "span", { class: "lh-note" }, t("libhelp.neverNote"))), back, next));
    const backdrop = h(doc, "div", { class: "lh-backdrop", role: "dialog", "aria-modal": "true", "aria-labelledby": "lh-title", "data-ui": "library-help" }, modal);
    backdrop.addEventListener("click", (event) => {
      if (event.target === backdrop) close();
    });
    root = { backdrop, modal, tabs, panel, back, next, never };
    doc.body.append(backdrop);
    doc.addEventListener("keydown", onKey, true);
    doc.defaultView?.addEventListener?.("resize", onResize);
    draw();
    closeButton.focus();
  }
  function close() {
    if (!root) return;
    root.backdrop.remove();
    root = null;
    doc.removeEventListener("keydown", onKey, true);
    doc.defaultView?.removeEventListener?.("resize", onResize);
    opener?.focus?.();
    opener = null;
  }

  const button = () => {
    const b = h(doc, "button", { type: "button", class: "lh-open", "data-ui": "help-open", title: t("libhelp.button") }, h(doc, "span", { class: "lh-open-q", "aria-hidden": "true" }, "?"), h(doc, "span", { class: "lh-open-t" }, t("libhelp.button")));
    b.addEventListener("click", open);
    return b;
  };

  return { open, close, isOpen: () => root !== null, button };
}
