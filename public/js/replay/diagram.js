// The diagram of a replay: the same boxes and arrows as on the Create tab, read-only, with the state of
// every agent and the data flowing as the replay plays. A box shows the agent's name, its status and time.
// An arrow is dashed grey until it has carried data, solid after, and blue and blinking when it was just used.
import { h } from "../dom.js";
import { BOX_H, BOX_W, arrowsOf, autoPositions, extentOf, maxColsFor } from "../create/diagram-geometry.js";
import { flowState } from "./flow.js";
import { MULTI_RUN, nodeIdOf } from "../engine/spawn.js";
import { freePlacesOf } from "../engine/created.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEADS = ["pending", "used", "lit"];

function svgEl(doc, name, attrs = {}) {
  const el = doc.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export const HOLD_MS = 2500;
export const ROUND_MARK = "\u0001"; // where the round number goes in the badge text
const realClock = { setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms), clearTimeout: (id) => globalThis.clearTimeout(id) };

// onRetry(id): when given, an agent that failed gets a Retry button (retryLabel is its text).
// retryMenu: { arrowLabel, title, providerName(provider), tagText(choice), choicesOf(id) }; when given, the Retry button has an
// arrow that opens a list of models, and a pick calls onRetry(id, choice.value).
export function createReplayDiagram({ doc, design, wide, onSelect, statusText, boxLabel, startLabel = "", onRetry = null, retryLabel = "Retry", warnLabel = "Warning", errorLabel = "Error", retryMenu = null, clock = realClock, now = () => Date.now(), createdText = "created", freePlaceText = (n, max) => `${n}/${max}` }) {
  // The places still free for created agents are laid out like boxes (an arrow from their creator is used for the layout only).
  const free = freePlacesOf(design);
  const freeId = (p) => `~free-${p.by}-${p.n}`;
  const layout = free.length === 0 ? design : { ...design, nodes: [...design.nodes, ...free.map((p) => ({ id: freeId(p), agent: "free", model: "fast", search: false }))], edges: [...design.edges, ...free.map((p) => ({ from: p.by, to: freeId(p) }))] };
  const pos = autoPositions(layout, { wide, maxCols: maxColsFor(doc.defaultView) });
  const { width, height } = extentOf(pos);
  const area = h(doc, "div", { class: "diagram replay-diagram", "data-ui": "replay-diagram" });
  const wrap = h(doc, "div", { class: "diagram-wrap replay-diagram-wrap", "data-ui": "replay-diagram-wrap" }, area);
  area.style.width = `${width}px`;
  area.style.height = `${height}px`;

  const svg = svgEl(doc, "svg", { class: "diagram-arrows", "aria-hidden": "true", width, height });
  const defs = svgEl(doc, "defs");
  for (const head of HEADS) {
    const marker = svgEl(doc, "marker", { id: `flow-head-${head}`, viewBox: "0 0 10 10", refX: 10, refY: 5, markerWidth: 10, markerHeight: 10, markerUnits: "userSpaceOnUse", orient: "auto-start-reverse", class: `flow-head ${head}` });
    marker.append(svgEl(doc, "path", { d: "M0,0 L10,5 L0,10 z" }));
    defs.append(marker);
  }
  svg.append(defs);
  area.append(svg);

  const arrows = arrowsOf(design, pos);
  const lines = new Map(); // key -> path element
  for (const arrow of arrows) {
    const path = svgEl(doc, "path", { d: arrow.d, class: "flow pending", fill: "none", "marker-end": "url(#flow-head-pending)", "data-flow": arrow.key });
    svg.append(path);
    lines.set(arrow.key, path);
  }

  // The list of models under the arrow of a Retry button. It sits on the page (fixed), so the diagram's own scrolling cannot cut it off.
  let menu = null;
  let menuCleanup = null;
  function closeMenu() {
    if (menu) menu.remove();
    menu = null;
    if (menuCleanup) menuCleanup();
    menuCleanup = null;
  }
  function openMenu(id, arrow) {
    const wasOpenHere = menu !== null && menu.getAttribute("data-for") === id;
    closeMenu();
    arrow.setAttribute("aria-expanded", "false");
    if (wasOpenHere || !retryMenu) return;
    const list = h(doc, "div", { class: "retry-menu", role: "menu", "data-ui": "retry-menu", "data-for": id }, h(doc, "p", { class: "retry-menu-title" }, retryMenu.title));
    let lastProvider = null;
    const extra = retryMenu.extra ? retryMenu.extra(id) : null;
    for (const choice of retryMenu.choicesOf(id)) {
      if (choice.provider !== lastProvider) {
        lastProvider = choice.provider;
        list.append(h(doc, "p", { class: "retry-menu-group" }, retryMenu.providerName(choice.provider)));
      }
      const item = h(doc, "button", { type: "button", role: "menuitem", class: `retry-menu-item${choice.current ? " current" : ""}`, "data-ui": "retry-choice", "data-model": choice.id }, h(doc, "span", {}, choice.id), h(doc, "small", {}, retryMenu.tagText(choice)));
      item.addEventListener("click", () => {
        closeMenu();
        onRetry(id, choice.value, { useCurrentLimits: extra ? extra.useCurrent() : true });
      });
      list.append(item);
    }
    if (extra) list.append(h(doc, "hr", { class: "retry-menu-rule" }), extra.element);
    const rect = arrow.getBoundingClientRect?.();
    if (rect && list.style) {
      const width = 300;
      list.style.left = `${Math.max(8, Math.min(rect.right - width, (doc.defaultView?.innerWidth ?? 1024) - width - 8))}px`;
      list.style.top = `${rect.bottom + 4}px`;
    }
    (doc.body ?? area).append(list);
    arrow.setAttribute("aria-expanded", "true");
    menu = list;
    const outside = (event) => {
      if (!list.contains(event.target) && event.target !== arrow) closeMenu();
    };
    const escape = (event) => {
      if (event.key === "Escape") closeMenu();
    };
    doc.addEventListener("pointerdown", outside, true);
    doc.addEventListener("keydown", escape);
    wrap.addEventListener?.("scroll", closeMenu);
    menuCleanup = () => {
      doc.removeEventListener("pointerdown", outside, true);
      doc.removeEventListener("keydown", escape);
      arrow.setAttribute("aria-expanded", "false");
    };
  }

  const boxes = new Map();
  for (const node of design.nodes) {
    const name = h(doc, "strong", {}, "");
    const status = h(doc, "small", {}, "");
    const multi = node.agent === MULTI_RUN[design.pattern];
    const runsBadge = h(doc, "span", { class: "dnode-runs", "data-ui": "diagram-runs", hidden: !multi });
    const errBadge = h(doc, "span", { class: "dnode-err", "data-ui": "diagram-error", role: "img", "aria-label": errorLabel, title: errorLabel, hidden: true }, "!");
    const warnBadge = h(doc, "span", { class: "dnode-warn", "data-ui": "diagram-warn", role: "img", "aria-label": warnLabel, title: warnLabel, hidden: true }, "!");
    const box = h(doc, "button", { type: "button", class: "rnode", "data-node-id": node.id, ...(multi ? { "data-multi": "true" } : {}), ...(node.created === true ? { "data-created": "true" } : {}), "data-ui": `diagram-node-${node.id}`, "data-status": "waiting", "aria-pressed": "false", ...(design.pattern === "handoff" && design.start === node.id && startLabel ? { "data-start": startLabel } : {}) }, name, status, runsBadge, errBadge, warnBadge);
    box.style.left = `${pos.get(node.id).x}px`;
    box.style.top = `${pos.get(node.id).y}px`;
    box.style.width = `${BOX_W}px`;
    box.style.height = `${BOX_H}px`;
    box.addEventListener("click", () => onSelect(node.id));
    // The button sits on the box, not in it (a button cannot hold a button); it shows only while the agent has failed.
    let retry = null;
    if (onRetry) {
      const main = h(doc, "button", { type: "button", class: "rnode-retry", "data-ui": `diagram-retry-${node.id}` }, retryLabel);
      main.addEventListener("click", () => {
        closeMenu();
        onRetry(node.id, undefined, { useCurrentLimits: true });
      });
      retry = h(doc, "span", { class: "rnode-retry-group", hidden: true }, main);
      if (retryMenu && node.created !== true) {
        const arrow = h(doc, "button", { type: "button", class: "rnode-retry-arrow", "aria-haspopup": "menu", "aria-expanded": "false", "aria-label": retryMenu.arrowLabel, title: retryMenu.arrowLabel, "data-ui": `diagram-retry-menu-${node.id}` }, "▾");
        arrow.addEventListener("click", () => openMenu(node.id, arrow));
        retry.append(arrow);
      }
      retry.style.left = `${pos.get(node.id).x + BOX_W - (retryMenu && node.created !== true ? 86 : 64)}px`;
      retry.style.top = `${pos.get(node.id).y + BOX_H - 26}px`;
    }
    boxes.set(node.id, { box, name, status, retry, runsBadge, errBadge, warnBadge, multi, created: node.created === true });
    area.append(box);
    if (retry) area.append(retry);
  }
  for (const place of free) {
    const spot = h(doc, "div", { class: "rnode free-place", "data-ui": "free-place" }, freePlaceText(place.n, place.max));
    spot.style.left = `${pos.get(freeId(place)).x}px`;
    spot.style.top = `${pos.get(freeId(place)).y}px`;
    spot.style.width = `${BOX_W}px`;
    spot.style.height = `${BOX_H}px`;
    area.append(spot);
  }
  const badge = h(doc, "span", { class: "round-badge diagram-badge", "data-ui": "debate-round", hidden: true });
  wrap.append(badge); // shown above the boxes, so it never covers one

  let lastIndex = null;
  let blinkPhase = false;
  let lastArgs = null;
  let timer = null;
  const held = new Map(); // key -> { until, cls }: arrows that carried data a moment ago stay lit and blinking

  // events: all events of the run; cursor: how many are applied; state: the inspector state; selectedId: the agent shown below.
  function update(args) {
    lastArgs = args;
    const { events, cursor, state, selectedId, badgeText, badgeNumber, failed, marks = new Map(), notes = new Map(), runs = new Map(), idleStatus = "waiting" } = args;
    for (const [id, parts] of boxes) {
      // An agent that failed in a recorded run shows as failed from the start, before the replay reaches the failure.
      // A node that runs once for every part or step is one box: its runs are summed up in `runs` (status, text and count).
      const sum = runs.get(id);
      const isFailed = failed?.has(id) === true;
      const agent = sum ? { status: sum.status, ms: null, label: boxLabel(id) } : isFailed ? { ...(state.agents[id] ?? { ms: null }), status: "error" } : state.agents[id];
      parts.errBadge.hidden = !(agent?.errors > 0 || agent?.status === "error");
      parts.warnBadge.hidden = !(agent?.warnings > 0);
      parts.runsBadge.hidden = !parts.multi;
      parts.runsBadge.textContent = sum ? sum.badge : parts.multi ? "×?" : "";
      const status = agent?.status ?? idleStatus;
      parts.box.setAttribute("data-status", status);
      parts.box.setAttribute("aria-pressed", String(selectedId === id || (parts.multi && typeof selectedId === "string" && nodeIdOf(selectedId) === id)));
      parts.name.textContent = agent?.label ?? boxLabel(id);
      // A voting run marks every agent once the tally has decided: "agrees", "differs" (dimmed) or the count.
      const mark = status === "done" ? marks.get(id) : undefined;
      parts.status.textContent = `${sum ? sum.text : mark ? mark.text : statusText(agent ?? { status: idleStatus, ms: null })}${notes.get(id) ? ` · ${notes.get(id)}` : ""}${parts.created ? ` · ${createdText}` : ""}`;
      parts.box.setAttribute("data-dissent", String(mark?.dissent === true));
      if (parts.retry) {
        parts.retry.hidden = status !== "error";
        if (status !== "error" && menu?.getAttribute("data-for") === id) closeMenu();
      }
    }
    const { used, latest } = flowState(events, cursor, design);
    const time = now();
    // An arrow that has just carried data stays lit and blinks for a few seconds, longer than the data really
    // takes, so that a person can see it. Two identical animations alternate so that a repeated use blinks again.
    if (latest && latest.index !== lastIndex && lines.has(latest.key)) {
      blinkPhase = !blinkPhase;
      held.set(latest.key, { until: time + HOLD_MS, cls: blinkPhase ? "blink-a" : "blink-b" });
    }
    lastIndex = latest ? latest.index : null;
    let nextExpiry = Infinity;
    for (const [key, path] of lines) {
      const hold = held.get(key);
      if (hold && hold.until <= time) held.delete(key);
      const active = held.get(key);
      const lit = Boolean(active); // blue only while it blinks; afterwards a solid grey arrow
      const state2 = lit ? "lit" : used.has(key) ? "used" : "pending";
      path.setAttribute("class", `flow ${state2}${active ? " " + active.cls : ""}`);
      // The arrow of a voter that differs from the result is dashed and dimmed.
      const from = arrows.find((a) => a.key === key)?.from;
      path.setAttribute("data-dissent", String(marks.get(from)?.dissent === true));
      path.setAttribute("marker-end", `url(#flow-head-${state2})`);
      if (active) nextExpiry = Math.min(nextExpiry, active.until);
    }
    if (timer !== null) clock.clearTimeout(timer);
    timer = nextExpiry === Infinity ? null : clock.setTimeout(() => {
      timer = null;
      if (lastArgs) update(lastArgs);
    }, Math.max(0, nextExpiry - time) + 20);
    badge.hidden = !badgeText;
    // The number of the current round flashes. badgeText holds it as a marker (RN) where the number goes.
    const pieces = typeof badgeText === "string" && badgeNumber !== undefined ? badgeText.split(ROUND_MARK) : null;
    if (pieces && pieces.length === 2) {
      badge.replaceChildren(doc.createTextNode(pieces[0]), h(doc, "span", { class: "round-no", "data-ui": "debate-round-number" }, String(badgeNumber)), doc.createTextNode(pieces[1]));
    } else {
      badge.replaceChildren(doc.createTextNode(badgeText ?? ""));
    }
  }

  return { element: wrap, update, destroy: () => { if (timer !== null) clock.clearTimeout(timer); timer = null; closeMenu(); } };
}
