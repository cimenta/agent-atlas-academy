// The diagram of a replay: the same boxes and arrows as on the Create tab, read-only, with the state of
// every agent and the data flowing as the replay plays. A box shows the agent's name, its status and time.
// An arrow is dashed grey until it has carried data, solid after, and blue and blinking when it was just used.
import { h } from "../dom.js";
import { BOX_H, BOX_W, arrowsOf, autoPositions, extentOf } from "../create/diagram-geometry.js";
import { flowState } from "./flow.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const HEADS = ["pending", "used", "lit"];

function svgEl(doc, name, attrs = {}) {
  const el = doc.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function createReplayDiagram({ doc, design, wide, onSelect, statusText, boxLabel }) {
  const pos = autoPositions(design, { wide });
  const { width, height } = extentOf(pos);
  const area = h(doc, "div", { class: "diagram replay-diagram", "data-ui": "replay-diagram" });
  const wrap = h(doc, "div", { class: "diagram-wrap", "data-ui": "replay-diagram-wrap" }, area);
  area.style.width = `${width}px`;
  area.style.height = `${height}px`;

  const svg = svgEl(doc, "svg", { class: "diagram-arrows", "aria-hidden": "true", width, height });
  const defs = svgEl(doc, "defs");
  for (const head of HEADS) {
    const marker = svgEl(doc, "marker", { id: `flow-head-${head}`, viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: "auto-start-reverse", class: `flow-head ${head}` });
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

  const boxes = new Map();
  for (const node of design.nodes) {
    const name = h(doc, "strong", {}, "");
    const status = h(doc, "small", {}, "");
    const box = h(doc, "button", { type: "button", class: "rnode", "data-node-id": node.id, "data-ui": `diagram-node-${node.id}`, "data-status": "waiting", "aria-pressed": "false" }, name, status);
    box.style.left = `${pos.get(node.id).x}px`;
    box.style.top = `${pos.get(node.id).y}px`;
    box.style.width = `${BOX_W}px`;
    box.style.height = `${BOX_H}px`;
    box.addEventListener("click", () => onSelect(node.id));
    boxes.set(node.id, { box, name, status });
    area.append(box);
  }
  const badge = h(doc, "span", { class: "round-badge diagram-badge", "data-ui": "debate-round", hidden: true });
  area.append(badge);

  let lastIndex = null;
  let blinkPhase = false;

  // events: all events of the run; cursor: how many are applied; state: the inspector state; selectedId: the agent shown below.
  function update({ events, cursor, state, selectedId, badgeText }) {
    for (const [id, parts] of boxes) {
      const agent = state.agents[id];
      const status = agent?.status ?? "waiting";
      parts.box.setAttribute("data-status", status);
      parts.box.setAttribute("aria-pressed", String(selectedId === id));
      parts.name.textContent = agent?.label ?? boxLabel(id);
      parts.status.textContent = agent ? statusText(agent) : "";
    }
    const { used, latest } = flowState(events, cursor, design);
    const newest = latest?.key ?? null;
    for (const [key, path] of lines) {
      const lit = key === newest;
      const isUsed = used.has(key);
      const state2 = lit ? "lit" : isUsed ? "used" : "pending";
      // The arrow that has just carried data blinks for about a second. Two identical animations alternate so that
      // the same arrow used twice in a row blinks again.
      const fresh = lit && latest.index !== lastIndex;
      if (fresh) blinkPhase = !blinkPhase;
      path.setAttribute("class", `flow ${state2}${fresh ? (blinkPhase ? " blink-a" : " blink-b") : ""}`);
      path.setAttribute("marker-end", `url(#flow-head-${state2})`);
    }
    lastIndex = latest ? latest.index : null;
    badge.hidden = !badgeText;
    badge.textContent = badgeText ?? "";
  }

  return { element: wrap, update };
}
