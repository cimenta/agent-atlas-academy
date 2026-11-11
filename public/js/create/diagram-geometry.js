// Where the boxes and arrows of a diagram go. The Create tab and the replay draw the same picture,
// so both take their sizes, positions and arrows from here. Pure: no DOM.
import { layoutDesign } from "./editor-model.js";

export const CELL_W = 160;
export const CELL_H = 96;
export const BOX_W = 132;
export const BOX_H = 60;
export const DEBATE_GUTTER = 40; // room left of the debaters for the next-round arrow
export const TOUCH = 2; // arrows end this far inside the box, so the tip touches the body of the agent
export const TWO_WAY_GAP = 9; // distance of each of the two arrows of a two-way connection from the middle

// A chain reads top to bottom on a narrow screen and left to right when there is room.
export function orientationFor(pattern, wide) {
  return pattern === "sequential" && !wide ? "vertical" : "horizontal";
}

// The top-left corner of every box, as the editor places them before the visitor moves anything.
export function autoPositions(design, { wide }) {
  const auto = layoutDesign(design, { orientation: orientationFor(design.pattern, wide) });
  const gutter = design.pattern === "debate" ? DEBATE_GUTTER : 0;
  const pos = new Map();
  for (const node of design.nodes) {
    const a = auto.nodes.find((n) => n.id === node.id);
    pos.set(node.id, { x: a.x * CELL_W + (CELL_W - BOX_W) / 2 + gutter, y: a.y * CELL_H + (CELL_H - BOX_H) / 2 });
  }
  return pos;
}

export function extentOf(pos) {
  const xs = [...pos.values()].map((p) => p.x + BOX_W + 24);
  const ys = [...pos.values()].map((p) => p.y + BOX_H + 24);
  return { width: Math.max(CELL_W, ...xs), height: Math.max(CELL_H * 2, ...ys) };
}

export const centerOf = (pos, id) => ({ x: pos.get(id).x + BOX_W / 2, y: pos.get(id).y + BOX_H / 2 });

// The point on the edge of the box centred on `to` that lies towards `from`.
export function clipToBox(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const scale = Math.min(dx === 0 ? Infinity : BOX_W / 2 / Math.abs(dx), dy === 0 ? Infinity : BOX_H / 2 / Math.abs(dy));
  return { x: to.x - dx * scale, y: to.y - dy * scale };
}

// Where a straight arrow from box `from` to box `to` starts and ends, moved sideways by `shift` pixels.
export function straight(pos, from, to, shift = 0) {
  const a = centerOf(pos, from);
  const b = centerOf(pos, to);
  const start = clipToBox(b, a);
  const end = clipToBox(a, b);
  const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const nx = (-(end.y - start.y) / length) * shift;
  const ny = ((end.x - start.x) / length) * shift;
  const ux = (end.x - start.x) / length;
  const uy = (end.y - start.y) / length;
  return { x1: start.x + nx - ux * TOUCH, y1: start.y + ny - uy * TOUCH, x2: end.x + nx + ux * TOUCH, y2: end.y + ny + uy * TOUCH };
}

// The data goes both ways between a supervisor and its workers: the instruction down, the result back.
export const isTwoWay = (design) => design.pattern === "supervisor";

// The arrows to draw for a design. Each has a key "from>to" that matches the handoff events of a run
// (turn arrows of a debate have the key "turn:from>to"), and a path.
export function arrowsOf(design, pos) {
  const out = [];
  for (const edge of design.edges) {
    if (!pos.has(edge.from) || !pos.has(edge.to)) continue;
    if (isTwoWay(design)) {
      for (const [from, to, shift] of [[edge.from, edge.to, -TWO_WAY_GAP], [edge.to, edge.from, -TWO_WAY_GAP]]) {
        const s = straight(pos, from, to, shift);
        out.push({ key: `${from}>${to}`, from, to, kind: "edge", d: `M ${s.x1} ${s.y1} L ${s.x2} ${s.y2}`, edge });
      }
    } else {
      const s = straight(pos, edge.from, edge.to);
      out.push({ key: `${edge.from}>${edge.to}`, from: edge.from, to: edge.to, kind: "edge", d: `M ${s.x1} ${s.y1} L ${s.x2} ${s.y2}`, edge });
    }
  }
  out.push(...turnArrows(design, pos));
  return out;
}

// In a debate the debaters answer each other in turn: an arrow from each debater to the next, and a
// dashed one from the last back to the first for the next round (when there is more than one round).
export function turnArrows(design, pos) {
  if (design.pattern !== "debate") return [];
  const ids = design.nodes.filter((n) => n.agent === "debater" && pos.has(n.id)).map((n) => n.id);
  if (ids.length < 2) return [];
  const out = [];
  for (let i = 0; i + 1 < ids.length; i++) {
    const s = straight(pos, ids[i], ids[i + 1]);
    out.push({ key: `turn:${ids[i]}>${ids[i + 1]}`, from: ids[i], to: ids[i + 1], kind: "turn", d: `M ${s.x1} ${s.y1} L ${s.x2} ${s.y2}` });
  }
  if ((design.rounds ?? 1) > 1) {
    const first = pos.get(ids[0]);
    const last = pos.get(ids.at(-1));
    const left = Math.min(first.x, last.x);
    const bend = Math.max(2, left - 36);
    const d = `M ${last.x} ${last.y + BOX_H / 2} Q ${bend} ${(first.y + last.y + BOX_H) / 2} ${first.x - 2} ${first.y + BOX_H / 2}`;
    out.push({ key: `turn:${ids.at(-1)}>${ids[0]}`, from: ids.at(-1), to: ids[0], kind: "return", d });
  }
  return out;
}
