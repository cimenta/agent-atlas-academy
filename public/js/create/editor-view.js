// The diagram editor on screen: palette, diagram with arrows, settings for one agent, and the
// list of rules the design still breaks. All rules live in editor-model.js; this file only draws.
import { h } from "../dom.js";
import { helpIcon } from "../help-popup.js";
import { agentLabel } from "../engine/labels.js";
import { AGENT_TYPES, CRITERIA_MAX, MODELS, LIMIT_DEFAULTS, OUTPUT_TOKENS, CREATOR_TYPES, NODE_MAX, INSTRUCTIONS_MAX } from "../engine/catalog.js";
import { createCapFor } from "../engine/created.js";
import { AGENT_LIMIT_KEYS, agentLimitRange } from "../engine/agent-limits.js";
import { toolsPane as drawToolsPane } from "./tools-pane.js";
import { roleText } from "../engine/prompts.js";
import { mayCondense } from "../engine/condense.js";
import { mayGuard, cleanGuardrails, GUARDRAIL_MAX, WORDS_MAX, LENGTH_MIN, LENGTH_MAX, POLICY_MAX, GUARDRAIL_KINDS } from "../engine/guardrails.js";
import { mayFormat, validFormat, formatPromptText, FORMAT_TYPES, FORMAT_MAX_FIELDS, FIELD_NAME_MAX } from "../engine/format.js";
import { innerTabs } from "./steps-view.js";
import { agentTabIds, currentAgentTab } from "./agent-tabs.js";
import { skillsPane } from "./skills-pane.js";
import { MULTI_RUN } from "../engine/spawn.js";
import { BOX_H, BOX_W, autoPositions, centerOf as geometryCenter, clipToBox, extentOf, isTwoWay, maxColsFor, orientationFor, flippedOf, linkBetween, linkPath, portPointAt, portSideOf, PORT_R, turnArrows, TWO_WAY_GAP } from "./diagram-geometry.js";

const MOVE_THRESHOLD = 5;
const SVG_NS = "http://www.w3.org/2000/svg";

export function mountEditor(container, { editor, t, doc = document, onChange = () => {}, skillsUi = null, getModels = (node) => MODELS, modelUi = null, webSearchAllowed = () => true, ownToolsAllowed = () => true, simple = false, toolsAvailable = () => true, searchAvailable = () => true, runLimits = () => ({ ...LIMIT_DEFAULTS, maxOutputTokens: OUTPUT_TOKENS.default }) }) {
  let selectedId = null;
  let settingsTab = "tools"; // the tab of the agent settings that is open, kept while the visitor works on agents
  let connectFrom = null;
  let connectionsShown = false; // the list of connections is hidden until the student asks for it
  let notice = "";
  let selectedEdge = null;
  let suppressClick = false;
  let pendingDrop = null;
  let livePos = new Map(); // where the nodes are drawn right now, so a change never moves them

  // Once the visitor works on the diagram the layout is theirs: pin every node where it is.
  const freeze = () => {
    for (const [id, p] of livePos) editor.setPosition(id, p.x, p.y);
  };
  // The next free spot to the right of the existing nodes (landscape), or a new row when the row is full.
  const nextSpot = () => {
    const points = [...livePos.values()];
    if (points.length === 0) return null;
    const right = points.reduce((a, b) => (b.x > a.x ? b : a));
    if (right.x + 2 * BOX_W + 40 <= 720) return { x: right.x + BOX_W + 40, y: right.y };
    return { x: Math.min(...points.map((p) => p.x)), y: Math.max(...points.map((p) => p.y)) + BOX_H + 40 };
  };

  const nodeLabel = (node) => {
    if (node.name) return node.name;
    const suffix = /-(\d+)$/.exec(node.id);
    return `${t(`agent.${node.agent}.label`)}${suffix ? ` ${suffix[1]}` : ""}`;
  };
  const errorText = (code, params) => t(`design.error.${code}`, params ?? {});
  const refuse = (code) => {
    notice = t("editor.refused", { reason: errorText(code) });
  };
  const changed = () => {
    onChange();
    draw();
  };

  const root = h(doc, "div", { class: "editor" });
  container.replaceChildren(root);

  function addAgent(agent) {
    const spot = pendingDrop ?? nextSpot();
    freeze();
    const result = editor.addNode(agent);
    if (!result.ok) return refuse(result.code), draw();
    notice = "";
    selectedId = result.id;
    if (spot) editor.setPosition(result.id, spot.x, spot.y);
    pendingDrop = null;
    changed();
  }

  function tryConnect(from, to) {
    freeze();
    const result = editor.connect(from, to);
    connectFrom = null;
    if (!result.ok) {
      refuse(result.code);
      draw();
      return;
    }
    notice = "";
    changed();
  }

  function removeSelected() {
    if (selectedId === null) return;
    // Removing an agent also removes its connections, so ask first (the cross, the button and the Delete key all come here).
    const doomed = editor.design().nodes.find((n) => n.id === selectedId);
    const id = selectedId;
    const remove = () => {
      freeze();
      editor.removeNode(id);
      selectedId = null;
      connectFrom = null;
      selectedEdge = null;
      changed();
    };
    if (!doomed) return remove();
    if (!doc.body) {
      const ask = doc.defaultView?.confirm;
      if (ask && !ask.call(doc.defaultView, t("editor.removeConfirm", { name: nodeLabel(doomed) }))) return;
      return remove();
    }
    askRemove(nodeLabel(doomed), remove);
  }

  // The question before an agent goes: a small dialog over the page, with Keep as the button that has the focus.
  function askRemove(name, onYes) {
    const close = () => {
      overlay.remove();
      doc.removeEventListener("keydown", onKey, true);
    };
    const onKey = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
    };
    const keep = h(doc, "button", { type: "button", "data-ui": "remove-keep" }, t("editor.removeKeep"));
    const yes = h(doc, "button", { type: "button", class: "danger", "data-ui": "remove-yes" }, t("editor.removeYes"));
    keep.addEventListener("click", close);
    yes.addEventListener("click", () => {
      close();
      onYes();
    });
    const title = t("editor.removeConfirm", { name });
    const overlay = h(doc, "div", { class: "confirm-overlay", "data-ui": "remove-confirm" }, h(doc, "div", { class: "confirm-card", role: "alertdialog", "aria-modal": "true", "aria-label": title }, h(doc, "b", {}, title), h(doc, "div", { class: "confirm-buttons" }, keep, yes)));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close();
    });
    doc.body.append(overlay);
    doc.addEventListener("keydown", onKey, true);
    keep.focus();
  }

  function onNodeActivate(id) {
    if (connectFrom !== null && connectFrom !== id) return tryConnect(connectFrom, id);
    if (connectFrom === id) {
      connectFrom = null;
      return draw();
    }
    selectedId = id;
    draw();
  }

  function paletteBlock(design) {
    const items = editor.paletteFor().filter((p) => AGENT_TYPES[p.agent].patterns.includes(design.pattern));
    const buttons = items.map((p) => {
      const taken = !p.allowed;
      const button = h(
        doc,
        "button",
        { type: "button", class: "palette-item", "data-focus-key": `palette-${p.agent}`, "aria-disabled": taken ? "true" : undefined, title: taken ? t("editor.taken") : t(`agent.${p.agent}.help`), draggable: taken ? undefined : "true" },
        h(doc, "strong", {}, t(`agent.${p.agent}.label`)),
        h(doc, "span", { class: "palette-help" }, t(`agent.${p.agent}.help`)),
      );
      button.addEventListener("click", () => {
        if (taken) {
          notice = t("editor.taken");
          return draw();
        }
        addAgent(p.agent);
      });
      button.addEventListener("dragstart", (event) => {
        if (taken) return event.preventDefault();
        event.dataTransfer?.setData("text/plain", `agent:${p.agent}`);
      });
      return button;
    });
    return h(doc, "section", { class: "editor-palette", "data-ui": "agent-palette", "aria-label": t("editor.palette") }, h(doc, "h3", {}, t("editor.palette")), h(doc, "p", { class: "hint" }, t("editor.paletteHelp")), h(doc, "div", { class: "palette-list" }, ...buttons));
  }

  function diagramBlock(design) {
    // A chain reads top to bottom on a narrow screen and left to right when there is room.
    const wide = (doc.defaultView?.innerWidth ?? 0) >= 720;
    const stored = editor.positions();
    const pos = autoPositions(design, { wide, maxCols: maxColsFor(doc.defaultView) }); // id -> { x, y } top-left in px, updated live while dragging
    for (const node of design.nodes) if (stored[node.id]) pos.set(node.id, stored[node.id]);
    livePos = pos;
    const flips = flippedOf(design, { wide, maxCols: maxColsFor(doc.defaultView) });
    const vertical = orientationFor(design.pattern, wide) === "vertical";
    const usualSide = (id, kind) => (vertical ? (kind === "out" ? "bottom" : "top") : (kind === "out") !== flips.has(id) ? "right" : "left");
    // A dot is where its line is: at the bottom or the top of the box when the connection goes to another row.
    const sideOf = (id, kind) => portSideOf(design, pos, id, kind, usualSide(id, kind));
    const portOf = (id, kind) => portPointAt(pos, id, sideOf(id, kind));
    const extent = () => extentOf(pos);
    const area = h(doc, "div", { class: "diagram", "data-ui": "diagram", role: "group", "aria-label": t("editor.diagram") });
    const wrap = h(doc, "div", { class: "diagram-wrap" }, area);
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "diagram-arrows");
    svg.setAttribute("aria-hidden", "true");
    const size = () => {
      const { width, height } = extent();
      area.style.width = `${width}px`;
      area.style.height = `${height}px`;
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(height));
    };

    const defs = doc.createElementNS(SVG_NS, "defs");
    const marker = doc.createElementNS(SVG_NS, "marker");
    for (const [k, v] of Object.entries({ id: "arrowhead", viewBox: "0 0 10 10", refX: "10", refY: "5", markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse" })) marker.setAttribute(k, v);
    const tip = doc.createElementNS(SVG_NS, "path");
    tip.setAttribute("d", "M0,0 L10,5 L0,10 z");
    tip.setAttribute("fill", "currentColor");
    marker.append(tip);
    const linkMarker = marker.cloneNode(true);
    linkMarker.setAttribute("id", "linkhead");
    linkMarker.setAttribute("markerWidth", "6");
    linkMarker.setAttribute("markerHeight", "6");
    linkMarker.firstChild.style.fill = "var(--port-in)";
    defs.append(marker, linkMarker);
    svg.append(defs);
    area.append(svg);

    const centerOf = (id) => geometryCenter(pos, id);
    const clip = clipToBox;
    const setLine = (line, a, b) => {
      for (const [k, v] of Object.entries({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })) line.setAttribute(k, String(v));
    };
    const label = (id) => nodeLabel(design.nodes.find((n) => n.id === id));

    const nodeEls = new Map();
    let edgeParts = [];
    const rubber = doc.createElementNS(SVG_NS, "line");
    for (const [k, v] of Object.entries({ "stroke-width": "2", stroke: "currentColor", "stroke-dasharray": "6 4", "marker-end": "url(#linkhead)", visibility: "hidden" })) rubber.setAttribute(k, v);
    svg.append(rubber);

    // In a debate the debaters answer each other in turn. The visitor connects each debater to the judge;
    // the turn arrows between the debaters are drawn for them and cannot be edited.
    function drawTurns() {
      for (const arrow of turnArrows(design, pos)) {
        const path = doc.createElementNS(SVG_NS, "path");
        const attrs = { d: arrow.d, fill: "none", "marker-end": "url(#arrowhead)", "stroke-width": "2", stroke: "currentColor", "pointer-events": "none", "data-ui": "debate-turn" };
        if (arrow.kind === "return") attrs["stroke-dasharray"] = "6 4";
        for (const [k, v] of Object.entries(attrs)) path.setAttribute(k, v);
        svg.insertBefore(path, rubber);
        edgeParts.push(path);
      }
    }

    function drawEdges() {
      for (const part of edgeParts) part.remove();
      edgeParts = [];
      for (const [id, el] of nodeEls) {
        el.querySelector(".dnode-dot.out")?.setAttribute("data-side", sideOf(id, "out"));
        el.querySelector(".dnode-dot.in")?.setAttribute("data-side", sideOf(id, "in"));
      }
      drawTurns();
      for (const edge of design.edges) {
        const key = `${edge.from}>${edge.to}`;
        const selected = selectedEdge === key;
        // From the dot that sends to the dot that receives; the line stops at the circles, so it touches them.
        // Between two rows the line runs down along the gap and into the middle of the other box (see linkPath).
        const route = linkPath(pos, edge.from, edge.to, portOf(edge.from, "out"), portOf(edge.to, "in"));
        const line = doc.createElementNS(SVG_NS, "path");
        for (const [k, v] of Object.entries({ d: route.d, fill: "none", "marker-end": "url(#linkhead)", "stroke-width": selected ? "4" : "2", class: "edge-line", ...(selected ? { stroke: "var(--accent)" } : {}) })) line.setAttribute(k, v);
        const hit = doc.createElementNS(SVG_NS, "path");
        for (const [k, v] of Object.entries({ d: route.d, fill: "none", stroke: "transparent", "stroke-width": "22", class: "edge-hit" })) hit.setAttribute(k, v);
        hit.addEventListener("click", () => {
          selectedEdge = selectedEdge === key ? null : key;
          selectedId = null;
          draw();
        });
        // A right click on the connection removes it.
        hit.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          editor.disconnect(edge.from, edge.to);
          selectedEdge = null;
          changed();
        });
        hit.addEventListener("mouseenter", () => line.classList.add("hot"));
        hit.addEventListener("mouseleave", () => line.classList.remove("hot"));
        svg.insertBefore(line, rubber);
        edgeParts.push(line);
        svg.insertBefore(hit, rubber);
        edgeParts.push(hit);
        if (selected) {
          const mid = route.mid;
          const remove = h(doc, "button", { type: "button", class: "edge-remove", "data-focus-key": `edge-x-${key}`, "aria-label": t("editor.removeConnection", { from: label(edge.from), to: label(edge.to) }) }, "×");
          remove.style.left = `${mid.x - 18}px`;
          remove.style.top = `${mid.y - 18}px`;
          remove.addEventListener("click", () => {
            editor.disconnect(edge.from, edge.to);
            selectedEdge = null;
            changed();
          });
          area.append(remove);
          edgeParts.push(remove);
        }
      }
    }

    const freeze = () => {
      for (const [otherId, other] of pos) editor.setPosition(otherId, other.x, other.y); // once the visitor arranges things, the layout stays put
    };

    // Dragging a node moves it; a click without movement selects it.
    function wireMove(body, box, id) {
      let start = null;
      body.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button > 0) return;
        start = { px: event.clientX, py: event.clientY, x: pos.get(id).x, y: pos.get(id).y, moved: false };
        body.setPointerCapture?.(event.pointerId);
      });
      body.addEventListener("pointermove", (event) => {
        if (!start) return;
        const dx = event.clientX - start.px;
        const dy = event.clientY - start.py;
        if (!start.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
        start.moved = true;
        pos.set(id, { x: Math.max(0, start.x + dx), y: Math.max(0, start.y + dy) });
        box.style.left = `${pos.get(id).x}px`;
        box.style.top = `${pos.get(id).y}px`;
        size();
        drawEdges();
      });
      body.addEventListener("pointerup", () => {
        if (!start) return;
        const moved = start.moved;
        start = null;
        if (!moved) return;
        freeze();
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
        onChange();
        draw();
      });
      body.addEventListener("keydown", (event) => {
        const step = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
        if (!step) return;
        event.preventDefault();
        freeze();
        const p = pos.get(id);
        editor.setPosition(id, p.x + step[0], p.y + step[1]);
        draw();
      });
    }

    // Dragging the empty background pans the diagram (the wheel scrolls it as well).
    {
      let pan = null;
      const isBackground = (target) => target === area || (target?.tagName?.toLowerCase?.() === "svg" && area.contains?.(target));
      area.addEventListener("pointerdown", (event) => {
        if ((event.button !== undefined && event.button > 0) || !isBackground(event.target)) return;
        pan = { px: event.clientX, py: event.clientY, left: wrap.scrollLeft, top: wrap.scrollTop, moved: false };
        area.setPointerCapture?.(event.pointerId);
      });
      area.addEventListener("pointermove", (event) => {
        if (!pan) return;
        const dx = event.clientX - pan.px;
        const dy = event.clientY - pan.py;
        if (!pan.moved && Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
        pan.moved = true;
        wrap.scrollLeft = pan.left - dx;
        wrap.scrollTop = pan.top - dy;
        area.classList.add("panning");
      });
      const endPan = () => {
        if (!pan) return;
        if (pan.moved) {
          suppressClick = true;
          setTimeout(() => (suppressClick = false), 0);
        }
        pan = null;
        area.classList.remove("panning");
      };
      area.addEventListener("pointerup", endPan);
      area.addEventListener("pointercancel", endPan);
    }

    // Dragging from the dot that sends draws a line to the pointer; drop it on another agent to connect. When the agent cannot
    // receive it, the line turns red with a cross and the reason on it.
    let blockedMark = null;
    const clearBlocked = () => {
      blockedMark?.remove();
      blockedMark = null;
    };
    function wirePort(port, id) {
      let drag = null;
      const areaPoint = (event) => {
        const r = area.getBoundingClientRect();
        return { x: event.clientX - r.left, y: event.clientY - r.top };
      };
      const targetAt = (event) => doc.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-node-id]")?.getAttribute("data-node-id") ?? null;
      const clearMarks = () => {
        nodeEls.forEach((el) => {
          el.removeAttribute("data-target");
          el.querySelector(".dnode-dot.in")?.classList.remove("target");
        });
        rubber.removeAttribute("data-blocked");
        clearBlocked();
      };
      port.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button > 0) return;
        drag = { px: event.clientX, py: event.clientY, moved: false };
        port.setPointerCapture?.(event.pointerId);
      });
      port.addEventListener("pointermove", (event) => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(event.clientX - drag.px, event.clientY - drag.py) < MOVE_THRESHOLD) return;
        drag.moved = true;
        const from = portOf(id, "out");
        clearMarks();
        const over = targetAt(event);
        let end = areaPoint(event);
        if (over && over !== id) {
          const verdict = editor.canConnect(id, over);
          const target = portOf(over, "in");
          nodeEls.get(over)?.setAttribute("data-target", verdict.ok ? "ok" : "no");
          end = target;
          if (verdict.ok) nodeEls.get(over)?.querySelector(".dnode-dot.in")?.classList.add("target");
          else {
            rubber.setAttribute("data-blocked", "true");
            blockedMark = h(doc, "span", { class: "blocked-mark", role: "status", "data-ui": "blocked-mark" }, h(doc, "b", { class: "blocked-cross", "aria-hidden": "true" }, "×"), h(doc, "span", { class: "blocked-why" }, errorText(verdict.code)));
            blockedMark.style.left = `${(from.x + target.x) / 2}px`;
            blockedMark.style.top = `${(from.y + target.y) / 2}px`;
            area.append(blockedMark);
          }
        }
        const s2 = linkBetween(from, end);
        setLine(rubber, { x: s2.x1, y: s2.y1 }, { x: s2.x2, y: s2.y2 });
        rubber.setAttribute("visibility", "visible");
      });
      port.addEventListener("pointerup", (event) => {
        if (!drag) return;
        const moved = drag.moved;
        drag = null;
        rubber.setAttribute("visibility", "hidden");
        clearMarks();
        if (!moved) return; // a plain tap: the click handler starts tap-to-connect
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 0);
        const over = targetAt(event);
        if (over && over !== id) tryConnect(id, over);
      });
    }

    for (const node of design.nodes) {
      const body = h(
        doc,
        "button",
        { type: "button", class: flips.has(node.id) ? "dnode-body flipped" : "dnode-body", "data-focus-key": `node-${node.id}`, "aria-pressed": String(selectedId === node.id), "aria-label": t("editor.selectNode", { name: nodeLabel(node) }) },
        h(doc, "strong", {}, nodeLabel(node)),
        h(doc, "small", {}, modelUi ? modelUi.label(node) : (getModels(node).find((m) => m.key === node.model)?.label ?? "")),
        ...(design.memory?.notebook === true ? [h(doc, "small", { class: "dnode-notebook", "data-ui": "node-notebook" }, t(`editor.notebook.short.${node.notebook ?? "both"}`))] : []),
        ...(node.condense === true ? [h(doc, "small", { class: "dnode-notebook", "data-ui": "node-condense" }, t("editor.condensed"))] : []),
      );
      body.addEventListener("click", () => {
        if (suppressClick) return;
        selectedEdge = null;
        onNodeActivate(node.id);
      });
      // The dots: blue receives, green sends. A dot is there only when that connection is possible or already made; the colour stays.
      const usedIn = design.edges.some((e) => e.to === node.id);
      const usedOut = design.edges.some((e) => e.from === node.id);
      const canIn = usedIn || design.nodes.some((o) => o.id !== node.id && editor.canConnect(o.id, node.id).ok);
      const canOut = usedOut || design.nodes.some((o) => o.id !== node.id && editor.canConnect(node.id, o.id).ok);
      const port = h(doc, "button", { type: "button", class: "dnode-dot out", "data-side": sideOf(node.id, "out"), "data-focus-key": `connect-${node.id}`, "aria-pressed": String(connectFrom === node.id), "aria-label": t("editor.connectFrom", { name: nodeLabel(node) }), title: t("editor.portHelp"), ...(canOut ? {} : { hidden: true }) });
      const inPort = h(doc, "button", { type: "button", class: "dnode-dot in", "data-side": sideOf(node.id, "in"), "data-focus-key": `receive-${node.id}`, "aria-label": t("editor.connectTo", { name: nodeLabel(node) }), ...(canIn ? {} : { hidden: true }) });
      port.addEventListener("click", () => {
        if (suppressClick) return;
        connectFrom = connectFrom === node.id ? null : node.id;
        selectedId = node.id;
        selectedEdge = null;
        draw();
      });
      inPort.addEventListener("click", () => {
        if (connectFrom !== null && connectFrom !== node.id) tryConnect(connectFrom, node.id);
      });
      const isStart = design.pattern === "handoff" && design.start === node.id;
      // A node that runs once for every part or step is drawn as a stack with a badge (x2-6).
      const multi = node.agent === MULTI_RUN[design.pattern];
      const box = h(doc, "div", { class: "dnode", "data-node-id": node.id, "data-selected": String(selectedId === node.id), "data-connecting": String(connectFrom === node.id), ...(isStart ? { "data-start": "true" } : {}), ...(multi ? { "data-multi": "true" } : {}) }, body, port);
      if (multi) box.append(h(doc, "span", { class: "dnode-runs", "data-ui": "node-runs" }, t("editor.runsRange")));
      if (isStart) box.append(h(doc, "span", { class: "dnode-start", "data-ui": "start-flag" }, `▶ ${t("editor.startFlag")}`));
      box.append(port, inPort);
      {
        const cross = h(doc, "button", { type: "button", class: "dnode-remove", "data-focus-key": `delete-${node.id}`, "aria-label": t("editor.removeNamed", { name: nodeLabel(node) }), title: t("editor.remove") }, "×");
        cross.addEventListener("click", () => {
          selectedId = node.id;
          removeSelected();
        });
        box.append(cross);
      }
      box.style.left = `${pos.get(node.id).x}px`;
      box.style.top = `${pos.get(node.id).y}px`;
      box.style.width = `${BOX_W}px`;
      box.style.height = `${BOX_H}px`;
      nodeEls.set(node.id, box);
      area.append(box);
      wireMove(body, box, node.id);
      wirePort(port, node.id);
    }
    size();
    drawEdges();

    // A click on the empty diagram (one that also started there, so the end of a drag does not count) deselects.
    const onBackground = (event) => !event.target.closest?.(".dnode, .edge-hit, .edge-remove");
    let pressedOnBackground = false;
    area.addEventListener("pointerdown", (event) => {
      pressedOnBackground = onBackground(event);
    });
    area.addEventListener("click", (event) => {
      if (!pressedOnBackground || !onBackground(event)) return;
      pressedOnBackground = false;
      if (selectedId === null && connectFrom === null && selectedEdge === null) return;
      selectedId = null;
      connectFrom = null;
      selectedEdge = null;
      draw();
    });
    area.addEventListener("dragover", (event) => event.preventDefault());
    area.addEventListener("drop", (event) => {
      event.preventDefault();
      const data = event.dataTransfer?.getData("text/plain") ?? "";
      if (!data.startsWith("agent:")) return;
      const r = area.getBoundingClientRect();
      pendingDrop = { x: event.clientX - r.left - BOX_W / 2, y: event.clientY - r.top - BOX_H / 2 };
      addAgent(data.slice(6));
    });

    const empty = design.nodes.length === 0 ? h(doc, "p", { class: "hint" }, t("editor.empty")) : "";
    const connecting = connectFrom
      ? h(doc, "p", { class: "notice", role: "status" }, t("editor.connecting", { name: nodeLabel(design.nodes.find((n) => n.id === connectFrom)) }))
      : "";
    // Two icons in the corners of the diagram: tidy up (top right) and the list of connections (bottom right, with their number).
    const cornerIcon = (shapes) => {
      const icon = doc.createElementNS(SVG_NS, "svg");
      for (const [k, v] of Object.entries({ viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round" })) icon.setAttribute(k, v);
      for (const d of shapes) {
        const p = doc.createElementNS(SVG_NS, "path");
        p.setAttribute("d", d);
        icon.append(p);
      }
      return icon;
    };
    const tidy = h(doc, "button", { type: "button", class: "diagram-corner tr", "data-focus-key": "tidy", "data-ui": "diagram-tidy", title: t("editor.tidy"), "aria-label": t("editor.tidy") }, cornerIcon(["M2 2h5v5H2z", "M9 2h5v5H9z", "M2 9h5v5H2z", "M9 9h5v5H9z"]));
    tidy.addEventListener("click", () => {
      editor.clearPositions();
      changed();
    });
    const linksTitle = t(connectionsShown ? "editor.hideConnections" : "editor.showConnections", { n: design.edges.length });
    const links = h(doc, "button", { type: "button", class: "diagram-corner br", "data-focus-key": "connections-toggle", "data-ui": "connections-toggle", "aria-expanded": String(connectionsShown), title: linksTitle, "aria-label": linksTitle }, cornerIcon(["M2 5h10", "M9 2l3 3-3 3", "M14 11H4", "M7 8l-3 3 3 3"]), h(doc, "span", { class: "corner-badge", "aria-hidden": "true" }, String(design.edges.length)));
    links.addEventListener("click", () => {
      connectionsShown = !connectionsShown;
      changed();
    });
    const corners = design.nodes.length ? [tidy, links, ...(connectionsShown ? [h(doc, "div", { class: "connections-pop", "data-ui": "connections-list" }, connectionsBlock(design))] : [])] : [];
    const head = h(doc, "div", { class: "editor-diagram-head" }, h(doc, "h3", {}, t("editor.diagram")));
    return h(doc, "section", { class: "editor-diagram", "aria-label": t("editor.diagram") }, head, empty, connecting, h(doc, "div", { class: "diagram-frame" }, wrap, ...corners));
  }

  function connectionsBlock(design) {
    if (design.edges.length === 0) return h(doc, "p", { class: "hint" }, t("editor.noConnections"));
    const byId = new Map(design.nodes.map((n) => [n.id, n]));
    return h(
      doc,
      "ul",
      { class: "connection-list", "aria-label": t("editor.connections") },
      ...design.edges.map((edge) => {
        const from = nodeLabel(byId.get(edge.from));
        const to = nodeLabel(byId.get(edge.to));
        const button = h(doc, "button", { type: "button", "data-focus-key": `edge-${edge.from}-${edge.to}`, "aria-label": t("editor.removeConnection", { from, to }) }, "×");
        button.addEventListener("click", () => {
          editor.disconnect(edge.from, edge.to);
          changed();
        });
        return h(doc, "li", {}, h(doc, "span", {}, `${from} → ${to}`), button);
      }),
    );
  }

  // Limits of one agent: empty means it has none of its own and the limits of the run apply; the lower of the two wins.
  const LIMIT_FIELDS = [
    ["maxSteps", "steps"],
    ["maxTokens", "tokens"],
    ["maxOutputTokens", "output"],
    ["maxSearches", "searches"],
  ];
  function limitsIcon() {
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 16 16");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", "limit-icon");
    for (const [d] of [["M2 4h12"], ["M2 8h12"], ["M2 12h12"]]) {
      const line = doc.createElementNS(SVG_NS, "path");
      line.setAttribute("d", d);
      line.setAttribute("stroke", "currentColor");
      line.setAttribute("stroke-width", "1.5");
      line.setAttribute("fill", "none");
      svg.append(line);
    }
    for (const [cx, cy] of [[10, 4], [5, 8], [11, 12]]) {
      const dot = doc.createElementNS(SVG_NS, "circle");
      dot.setAttribute("cx", String(cx));
      dot.setAttribute("cy", String(cy));
      dot.setAttribute("r", "2");
      dot.setAttribute("fill", "currentColor");
      svg.append(dot);
    }
    return svg;
  }

  function limitsBlock(node) {
    const run = runLimits();
    const shown = LIMIT_FIELDS.filter(([key]) => key !== "maxSearches" || node.search === true);
    const inputs = new Map();
    const read = () => {
      const limits = {};
      for (const [key] of shown) {
        const raw = inputs.get(key).value.trim();
        if (raw !== "") limits[key] = Number(raw);
      }
      // A search limit stays with the agent even while search is switched off.
      if (node.search !== true && node.limits?.maxSearches !== undefined) limits.maxSearches = node.limits.maxSearches;
      // The tool calls are set in the tab Tools.
      if (node.limits?.maxToolCalls !== undefined) limits.maxToolCalls = node.limits.maxToolCalls;
      return limits;
    };
    const apply = () => {
      editor.setNode(node.id, { limits: read() });
      changed();
    };
    const rows = shown.map(([key, name]) => {
      const range = agentLimitRange(key);
      const input = h(doc, "input", { id: `ed-limit-${name}`, type: "number", min: range.min, max: range.max, step: 1, placeholder: t("editor.limits.fromRun"), "data-ui": `agent-limit-${name}` });
      if (node.limits?.[key] !== undefined) input.value = String(node.limits[key]);
      input.addEventListener("change", apply);
      inputs.set(key, input);
      const label = h(doc, "div", { class: "limit-label" }, h(doc, "label", { for: input.id }, t(`editor.limits.${name}.label`)), h(doc, "span", { class: "limit-hint" }, t(`editor.limits.${name}.hint`, { value: (run[key] ?? 0).toLocaleString("en-US") })));
      return h(doc, "div", { class: "limit-row" }, label, input);
    });
    const count = Object.keys(node.limits ?? {}).length;
    const onLimit = h(doc, "select", { id: "ed-on-limit", "data-ui": "agent-on-limit" }, ...["stop", "pass"].map((v) => h(doc, "option", { value: v, selected: (node.onLimit ?? "stop") === v }, t(`editor.limits.onLimit.${v}`))));
    onLimit.addEventListener("change", () => {
      editor.setNode(node.id, { onLimit: onLimit.value });
      changed();
    });
    return h(
      doc,
      "div",
      { class: "agent-limits", "data-ui": "agent-limits" },
      h(doc, "p", { class: "hint" }, t("editor.limits.help")),
      ...rows,
      h(doc, "div", { class: "field" }, h(doc, "label", { for: "ed-on-limit" }, t("editor.limits.onLimit.label")), onLimit),
    );
  }

  function settingsBlock(design) {
    const node = design.nodes.find((n) => n.id === selectedId);
    if (!node) return h(doc, "p", { class: "hint" }, t("editor.pickNode"));
    const type = AGENT_TYPES[node.agent];
    const field = (id, label, input) => h(doc, "div", { class: "field" }, h(doc, "label", { for: id }, label), input);
    // With modelUi the choices are grouped by key slot and the first one follows the default model; without it, one list of models.
    const model = modelUi
      ? h(doc, "select", { id: "ed-model", "data-ui": "agent-model" }, h(doc, "option", { value: "", selected: node.custom !== true }, modelUi.defaultOption()), ...modelUi.groups().map((g) => h(doc, "optgroup", { label: g.label }, ...g.options.map((o) => h(doc, "option", { value: o.value, selected: node.custom === true && o.value === modelUi.valueOf(node) }, o.label)))))
      : h(doc, "select", { id: "ed-model" }, ...getModels(node).map((m) => h(doc, "option", { value: m.key, selected: m.key === node.model }, `${m.label} (${m.id})`)));
    model.addEventListener("change", () => {
      if (modelUi) modelUi.pick(node.id, model.value);
      else editor.setNode(node.id, { model: model.value });
      changed();
    });
    const searchUnavailable = searchAvailable(node) === false;
    const remove = h(doc, "button", { type: "button", class: "danger small", "data-focus-key": "remove-node" }, t("editor.remove"));
    remove.addEventListener("click", () => removeSelected());
    // The Simple view leaves the model (the default one is used) and the settings in tabs to the Full view.
    const parts = [h(doc, "div", { class: "editor-settings-head" }, h(doc, "h4", {}, t("editor.settings", { name: nodeLabel(node) })), remove), ...(simple ? [] : [field("ed-model", t("editor.model"), model)])];
    if (node.agent === "evaluator" || (design.selfCritique === true && node.agent === "writer")) {
      // What the evaluator judges by, and how many rounds the loop may take.
      const criteria = h(doc, "textarea", { id: "ed-criteria", rows: 5, maxlength: CRITERIA_MAX, "data-ui": "evaluator-criteria" });
      criteria.value = editor.criteria();
      criteria.addEventListener("input", () => {
        editor.setCriteria(criteria.value);
        onChange();
      });
      criteria.addEventListener("change", () => draw());
      parts.push(field("ed-criteria", t("editor.criteria"), criteria), h(doc, "p", { class: "hint" }, t("editor.criteriaHelp")));
      const rounds = h(doc, "input", { id: "ed-eval-rounds", type: "number", min: 1, max: 4, step: 1, value: design.rounds, "data-ui": "evaluator-rounds" });
      rounds.addEventListener("change", () => {
        editor.setRounds(Number(rounds.value));
        changed();
      });
      parts.push(field("ed-eval-rounds", t("editor.evaluatorRounds"), rounds), h(doc, "p", { class: "hint" }, t("editor.evaluatorRoundsHelp")));
    }
    if (design.pattern === "handoff") {
      // Which agent begins the run. The one that begins shows a checked box that cannot be unchecked: another agent must be chosen.
      const isStart = design.start === node.id;
      const startBox = h(doc, "input", { id: "ed-start", type: "checkbox", checked: isStart, disabled: isStart, "data-ui": "handoff-start" });
      startBox.addEventListener("change", () => {
        editor.setStart(node.id);
        changed();
      });
      parts.push(h(doc, "div", { class: "field checkbox" }, startBox, h(doc, "label", { for: "ed-start" }, isStart ? t("editor.startsRun") : t("editor.makeStart"))), h(doc, "p", { class: "hint" }, t("editor.startHelp")));
    }
    // Tools: an agent gets only the tools it needs (see create/tools-pane.js).
    const toolsPane = drawToolsPane({ doc, t, node, editor, changed, searchUnavailable, webSearchAllowed: webSearchAllowed(), ownToolsAllowed: ownToolsAllowed(), toolsAvailable: toolsAvailable(node) });
    const approvalPane = [];
    // Approval: the run stops before this agent and waits for a click.
    const approve = h(doc, "input", { id: "ed-approve", type: "checkbox", checked: node.approve === true, "data-ui": "agent-approve" });
    approve.addEventListener("change", () => {
      editor.setNode(node.id, { approve: approve.checked });
      changed();
    });
    approvalPane.push(h(doc, "h4", { class: "editor-approval-heading" }, t("editor.approvalHeading"), helpIcon({ doc, t, id: "create-approval", name: t("editor.approvalHeading") })));
    approvalPane.push(h(doc, "div", { class: "field checkbox" }, approve, h(doc, "label", { for: "ed-approve" }, t("editor.approve"))));
    approvalPane.push(h(doc, "p", { class: "hint" }, t("editor.approveNote")));
    const notebookPane = [];
    // The shared notebook: what this agent may do with it. Only when the run has the notebook switched on.
    if (editor.notebookOn()) {
      const choices = editor.notebookChoices(node.id);
      notebookPane.push(h(doc, "h4", { class: "editor-notebook-heading" }, t("editor.notebookHeading"), helpIcon({ doc, t, id: "create-memory", name: t("editor.notebookHeading") })));
      const group = h(doc, "div", { class: "field", role: "radiogroup", "aria-label": t("editor.notebookHeading"), "data-ui": "agent-notebook" });
      for (const choice of choices) {
        const radio = h(doc, "input", { id: `ed-notebook-${choice}`, type: "radio", name: "ed-notebook", value: choice, checked: (node.notebook ?? "both") === choice, "data-ui": `notebook-${choice}` });
        radio.addEventListener("change", () => {
          editor.setNode(node.id, { notebook: choice });
          changed();
        });
        group.append(h(doc, "div", { class: "field checkbox" }, radio, h(doc, "label", { for: `ed-notebook-${choice}` }, t(`editor.notebook.${choice}`))));
      }
      notebookPane.push(group, h(doc, "p", { class: "hint" }, t(`editor.notebook.hint.${node.notebook ?? "both"}`)));
      if (choices.length < 4) notebookPane.push(h(doc, "p", { class: "hint", "data-ui": "notebook-decision" }, t("editor.notebook.decision")));
    }
    const condensePane = [];
    // Condensing: one extra call shortens what earlier agents wrote before this agent reads it. Not for an agent whose reply is a decision.
    condensePane.push(h(doc, "h4", { class: "editor-condense-heading" }, t("editor.condenseHeading"), helpIcon({ doc, t, id: "create-memory", name: t("editor.condenseHeading") })));
    if (mayCondense(node.agent, editor.design().pattern)) {
      const condense = h(doc, "input", { id: "ed-condense", type: "checkbox", checked: node.condense === true, "data-ui": "agent-condense" });
      condense.addEventListener("change", () => {
        editor.setNode(node.id, { condense: condense.checked });
        changed();
      });
      condensePane.push(h(doc, "div", { class: "field checkbox" }, condense, h(doc, "label", { for: "ed-condense" }, t("editor.condense"))));
      condensePane.push(h(doc, "p", { class: "hint" }, t("editor.condenseHint")));
    } else {
      condensePane.push(h(doc, "p", { class: "hint", "data-ui": "condense-decision" }, t("editor.condenseDecision")));
    }
    const limitsPane = [limitsBlock(node)];
    if (!type.free) {
      // The built-in agents are defined by a fixed prompt; show it so nothing is hidden.
      parts.push(
        h(
          doc,
          "details",
          { class: "agent-prompt", "data-ui": "agent-prompt", open: true },
          h(doc, "summary", {}, t("editor.prompt")),
          h(doc, "pre", {}, roleText(node, design.pattern)),
          h(doc, "p", { class: "hint" }, t("editor.promptHelp")),
        ),
      );
    }
    // Creating: a Supervisor or a Planner may be allowed to create agents while the run is going; the student sets the cap.
    const creator = CREATOR_TYPES.includes(node.agent);
    const createsPane = [];
    if (creator) {
      const room = createCapFor(design.nodes.length);
      createsPane.push(h(doc, "h4", { class: "editor-creates-heading" }, t("editor.creatingHeading"), helpIcon({ doc, t, id: "create-creating", name: t("editor.creatingHeading") })));
      if (room < 1 && node.creates === undefined) {
        createsPane.push(h(doc, "p", { class: "hint", "data-ui": "creates-no-room" }, t("editor.createsNoRoom", { total: NODE_MAX })));
      } else {
        const on = h(doc, "input", { id: "ed-creates-on", type: "checkbox", checked: node.creates !== undefined, "data-ui": "creates-on" });
        on.addEventListener("change", () => {
          editor.setNode(node.id, { creates: on.checked ? { max: 1, guidance: "", search: false } : null });
          changed();
        });
        createsPane.push(h(doc, "div", { class: "field checkbox" }, on, h(doc, "label", { for: "ed-creates-on" }, t("editor.creates"))), h(doc, "p", { class: "hint" }, t("editor.createsHint")));
        if (node.creates !== undefined) {
          const max = h(doc, "input", { id: "ed-creates-max", type: "number", min: 1, max: room, value: String(node.creates.max), "data-ui": "creates-max" });
          max.addEventListener("change", () => {
            editor.setNode(node.id, { creates: { ...editor.design().nodes.find((n) => n.id === node.id).creates, max: Number(max.value) } });
            changed();
          });
          const guidance = h(doc, "textarea", { id: "ed-creates-guidance", rows: 3, maxlength: INSTRUCTIONS_MAX, placeholder: t("editor.createsGuidancePlaceholder"), "data-ui": "creates-guidance" });
          guidance.value = node.creates.guidance ?? "";
          guidance.addEventListener("input", () => {
            editor.setNode(node.id, { creates: { ...editor.design().nodes.find((n) => n.id === node.id).creates, guidance: guidance.value } });
            onChange();
          });
          const search = h(doc, "input", { id: "ed-creates-search", type: "checkbox", checked: node.creates.search === true, "data-ui": "creates-search" });
          search.addEventListener("change", () => {
            editor.setNode(node.id, { creates: { ...editor.design().nodes.find((n) => n.id === node.id).creates, search: search.checked } });
            changed();
          });
          createsPane.push(
            field("ed-creates-max", t("editor.createsCap"), max),
            h(doc, "p", { class: "hint" }, t("editor.createsMaxHint", { max: room, n: design.nodes.length, total: NODE_MAX })),
            field("ed-creates-guidance", t("editor.createsGuidance"), guidance),
            h(doc, "div", { class: "field checkbox" }, search, h(doc, "label", { for: "ed-creates-search" }, t("editor.createsSearch"))),
            h(doc, "p", { class: "hint" }, t("editor.createsSearchHint")),
          );
        }
      }
    }
    // Answer format: an agent whose reply is not already a decision may be asked for named, typed fields (see engine/format.js).
    const formatOk = mayFormat(node.agent, design.pattern);
    const formatPane = [];
    if (formatOk) {
      const fields = () => editor.design().nodes.find((n) => n.id === node.id).format?.fields ?? [];
      const setFields = (next) => {
        editor.setNode(node.id, { format: next.length > 0 ? { fields: next } : null });
        changed();
      };
      formatPane.push(h(doc, "h4", { class: "editor-format-heading" }, t("editor.formatHeading"), helpIcon({ doc, t, id: "answer-format", name: t("editor.formatHeading") })));
      const on = h(doc, "input", { id: "ed-format-on", type: "checkbox", checked: node.format !== undefined, "data-ui": "format-on" });
      on.addEventListener("change", () => {
        editor.setNode(node.id, { format: on.checked ? { fields: [{ name: "answer", type: "text" }] } : null });
        changed();
      });
      formatPane.push(h(doc, "div", { class: "field checkbox" }, on, h(doc, "label", { for: "ed-format-on" }, t("editor.format"))), h(doc, "p", { class: "hint" }, t("editor.formatHint")));
      if (node.format !== undefined) {
        formatPane.push(h(doc, "p", { class: "hint" }, t("editor.formatFields", { max: FORMAT_MAX_FIELDS })));
        node.format.fields.forEach((f, i) => {
          const name = h(doc, "input", { type: "text", maxlength: FIELD_NAME_MAX, value: f.name, placeholder: t("editor.formatNamePlaceholder"), "aria-label": t("editor.formatNamePlaceholder"), "data-ui": `format-name-${i}` });
          name.addEventListener("change", () => {
            const next = fields().map((x, j) => (j === i ? { ...x, name: name.value.trim() } : x));
            if (validFormat({ fields: next })) return setFields(next);
            notice = t("editor.formatNameHint", { max: FIELD_NAME_MAX });
            draw();
          });
          const type = h(doc, "select", { "aria-label": t("editor.formatFields", { max: FORMAT_MAX_FIELDS }), "data-ui": `format-type-${i}` }, ...FORMAT_TYPES.map((value) => h(doc, "option", { value, selected: value === f.type }, t(`editor.formatType.${value}`))));
          type.addEventListener("change", () => setFields(fields().map((x, j) => (j === i ? { ...x, type: type.value } : x))));
          const row = [name, type];
          if (node.format.fields.length > 1) {
            const remove = h(doc, "button", { type: "button", "data-ui": `format-remove-${i}` }, t("editor.formatRemove"));
            remove.addEventListener("click", () => setFields(fields().filter((_, j) => j !== i)));
            row.push(remove);
          }
          formatPane.push(h(doc, "div", { class: "format-row" }, ...row));
        });
        if (node.format.fields.length < FORMAT_MAX_FIELDS) {
          const add = h(doc, "button", { type: "button", "data-ui": "format-add" }, t("editor.formatAdd"));
          add.addEventListener("click", () => {
            let n = fields().length + 1;
            while (fields().some((x) => x.name.toLowerCase() === `field ${n}`)) n += 1;
            setFields([...fields(), { name: `field ${n}`, type: "text" }]);
          });
          formatPane.push(add);
        }
        formatPane.push(h(doc, "h4", {}, t("editor.formatPreviewHeading")), h(doc, "pre", { "data-ui": "format-preview" }, formatPromptText(node.format)), h(doc, "p", { class: "hint" }, t("editor.formatRepairHint")));
      }
    }
    // Guardrails: up to three checks on what an agent receives or answers (see engine/guardrails.js).
    const guardrailsOk = mayGuard(node.agent, design.pattern);
    const guardrailsPane = [];
    if (guardrailsOk) {
      const list = () => editor.design().nodes.find((n) => n.id === node.id).guardrails ?? [];
      const setList = (next) => {
        const clean = next.length === 0 ? null : cleanGuardrails(next);
        if (next.length > 0 && (clean === null || clean.length !== next.length)) {
          notice = t("editor.guardrail.invalid", { min: LENGTH_MIN, max: LENGTH_MAX, policy: POLICY_MAX });
          draw();
          return;
        }
        editor.setNode(node.id, { guardrails: clean });
        changed();
      };
      const update = (i, patch) => setList(list().map((x, j) => (j === i ? { ...x, ...patch } : x)));
      const kindDefaults = { secret: {}, words: { words: [t("editor.guardrail.wordsDefault")] }, length: { max: 1500 }, reviewer: { policy: t("editor.guardrail.policyDefault"), model: "fast" } };
      guardrailsPane.push(h(doc, "h4", { class: "editor-guardrails-heading" }, t("editor.guardrailsHeading"), helpIcon({ doc, t, id: "guardrails", name: t("editor.guardrailsHeading") })), h(doc, "p", { class: "hint" }, t("editor.guardrailsHint", { max: GUARDRAIL_MAX })));
      (node.guardrails ?? []).forEach((g, i) => {
        const where = h(doc, "select", { "aria-label": t("editor.guardrail.whereLabel"), "data-ui": `guardrail-where-${i}` }, ...["output", "input"].map((value) => h(doc, "option", { value, selected: value === g.where }, t(`editor.guardrail.where.${value}`))));
        where.addEventListener("change", () => update(i, { where: where.value, onFail: where.value === "input" && g.onFail === "repair" ? "stop" : g.onFail }));
        const kind = h(doc, "select", { "aria-label": t("editor.guardrail.kindLabel"), "data-ui": `guardrail-kind-${i}` }, ...GUARDRAIL_KINDS.map((value) => h(doc, "option", { value, selected: value === g.kind }, t(`editor.guardrail.kind.${value}`))));
        kind.addEventListener("change", () => setList(list().map((x, j) => (j === i ? { where: x.where, onFail: x.onFail, kind: kind.value, ...kindDefaults[kind.value] } : x))));
        const remove = h(doc, "button", { type: "button", "data-ui": `guardrail-remove-${i}` }, t("editor.guardrailRemove"));
        remove.addEventListener("click", () => setList(list().filter((_, j) => j !== i)));
        const actions = g.where === "input" ? ["stop", "flag"] : ["repair", "stop", "flag"];
        const onFail = h(doc, "select", { id: `ed-guardrail-onfail-${i}`, "data-ui": `guardrail-onfail-${i}` }, ...actions.map((value) => h(doc, "option", { value, selected: value === g.onFail }, t(`editor.guardrail.onFail.${value}`))));
        onFail.addEventListener("change", () => update(i, { onFail: onFail.value }));
        const grid = [field(`ed-guardrail-onfail-${i}`, t("editor.guardrail.onFailLabel"), onFail)];
        const extra = [];
        if (g.kind === "reviewer") {
          const reviewer = h(doc, "select", { id: `ed-guardrail-model-${i}`, "data-ui": `guardrail-model-${i}` }, ...getModels(node).map((m) => h(doc, "option", { value: m.key, selected: m.key === (g.model ?? "fast") }, `${m.label} (${m.id})`)));
          reviewer.addEventListener("change", () => update(i, { model: reviewer.value }));
          grid.push(field(`ed-guardrail-model-${i}`, t("editor.guardrail.modelLabel"), reviewer));
          const policy = h(doc, "textarea", { id: `ed-guardrail-policy-${i}`, rows: 3, maxlength: POLICY_MAX, "data-ui": `guardrail-policy-${i}` });
          policy.value = g.policy ?? "";
          policy.addEventListener("change", () => update(i, { policy: policy.value.trim() }));
          extra.push(field(`ed-guardrail-policy-${i}`, t("editor.guardrail.policyLabel", { max: POLICY_MAX }), policy));
        } else if (g.kind === "words") {
          const words = h(doc, "textarea", { id: `ed-guardrail-words-${i}`, rows: 3, "data-ui": `guardrail-words-${i}` });
          words.value = (g.words ?? []).join("\n");
          words.addEventListener("change", () => update(i, { words: words.value.split("\n").map((w) => w.trim()).filter(Boolean).slice(0, WORDS_MAX) }));
          extra.push(field(`ed-guardrail-words-${i}`, t("editor.guardrail.wordsLabel"), words));
        } else if (g.kind === "length") {
          const max = h(doc, "input", { id: `ed-guardrail-max-${i}`, type: "number", min: LENGTH_MIN, max: LENGTH_MAX, value: String(g.max ?? 1500), "data-ui": `guardrail-max-${i}` });
          max.addEventListener("change", () => update(i, { max: Number(max.value) }));
          extra.push(field(`ed-guardrail-max-${i}`, t("editor.guardrail.maxLabel", { min: LENGTH_MIN, max: LENGTH_MAX }), max));
        }
        guardrailsPane.push(
          h(doc, "div", { class: "guardrail-row" },
            h(doc, "div", { class: "guardrail-top" }, h(doc, "b", {}, t("editor.guardrailTitle", { n: i + 1 })), where, kind, remove),
            h(doc, "div", { class: "guardrail-grid" }, ...grid),
            ...extra,
            h(doc, "p", { class: "hint" }, t(`editor.guardrail.hint.${g.kind}`, { max: WORDS_MAX })),
            ...(g.where === "input" ? [h(doc, "p", { class: "hint" }, t("editor.guardrail.hint.input"))] : []),
          ),
        );
      });
      if ((node.guardrails ?? []).length < GUARDRAIL_MAX) {
        const add = h(doc, "button", { type: "button", "data-ui": "guardrails-add" }, t("editor.guardrailsAdd"));
        add.addEventListener("click", () => setList([...list(), { where: "output", kind: "secret", onFail: "repair" }]));
        guardrailsPane.push(add);
      }
      guardrailsPane.push(h(doc, "p", { class: "hint" }, t("editor.guardrailsEstimate")));
    }
    // Skills: a role, a procedure and styles from the library of the student, on an agent whose reply is free text (see engine/skills.js).
    const skillsOk = skillsUi !== null && mayFormat(node.agent, design.pattern);
    const skillsTab = skillsOk ? skillsPane({ doc, t, node, lib: skillsUi.library(), startEntries: skillsUi.startEntries(node.agent), onSet: (list) => {
      editor.setNode(node.id, { skills: list ?? undefined });
      changed();
    } }) : [];
    // The settings that are not about the model sit in tabs, so the panel stays short.
    const panes = { skills: skillsTab, tools: toolsPane, condense: condensePane, approval: approvalPane, notebook: notebookPane, limits: limitsPane, format: formatPane, guardrails: guardrailsPane, creates: createsPane };
    const tabIds = agentTabIds({ notebookOn: editor.notebookOn(), creator, formatOk: mayFormat(node.agent, design.pattern), guardrailsOk: mayGuard(node.agent, design.pattern), skillsOk });
    settingsTab = currentAgentTab(settingsTab, tabIds);
    const limitCount = Object.keys(node.limits ?? {}).length;
    const tabLabel = { skills: `${t("editor.tab.skills")}${(node.skills ?? []).length > 0 ? ` (${node.skills.length})` : ""}`, tools: t("editor.toolsHeading"), condense: t("editor.condenseHeading"), approval: t("editor.approvalHeading"), notebook: t("editor.notebookHeading"), limits: `${t("editor.tab.limits")}${limitCount > 0 ? ` (${limitCount})` : ""}`, format: `${t("editor.tab.format")} · ${node.format ? t("editor.formatOn", { n: node.format.fields.length }) : t("editor.formatOff")}`, guardrails: `${t("editor.tab.guardrails")} · ${node.guardrails ? t("editor.guardrailsOn", { n: node.guardrails.length }) : t("editor.guardrailsOff")}`, creates: `${t("editor.tab.creates")} · ${node.creates ? t("editor.createsOn", { n: node.creates.max }) : t("editor.createsOff")}` };
    const paneHost = h(doc, "div", { class: "agent-tab-panes" });
    const paneEls = new Map(tabIds.map((id) => [id, h(doc, "div", { class: "agent-tab-pane", role: "tabpanel", "data-ui": `agent-pane-${id}`, hidden: id !== settingsTab }, ...panes[id])]));
    paneHost.append(...paneEls.values());
    const tabs = innerTabs({ doc, t, tabs: tabIds.map((id) => ({ id, label: tabLabel[id] })), current: settingsTab, onSelect: (id) => {
      settingsTab = id;
      for (const [pid, el] of paneEls) el.hidden = pid !== id;
      tabs.update(id);
    } });
    tabs.element.setAttribute("data-ui", "agent-tabs");
    if (!simple) parts.push(tabs.element, paneHost);
    if (type.free) {
      const name = h(doc, "input", { id: "ed-name", type: "text", maxlength: 40, value: node.name ?? "" });
      name.addEventListener("input", () => {
        editor.setNode(node.id, { name: name.value });
        onChange();
      });
      name.addEventListener("change", () => draw());
      const instructions = h(doc, "textarea", { id: "ed-instructions", rows: 5, maxlength: 2000 });
      instructions.value = node.instructions ?? "";
      instructions.addEventListener("input", () => {
        editor.setNode(node.id, { instructions: instructions.value });
        onChange();
      });
      parts.push(field("ed-name", t("editor.name"), name), field("ed-instructions", t("editor.instructions"), instructions));
    }
    if (node.agent === "critic" && (design.pattern === "sequential" || design.pattern === "parallel")) {
      const adds = h(doc, "input", { id: "ed-add-previous", type: "checkbox", checked: node.addToPrevious === true });
      adds.addEventListener("change", () => {
        editor.setNode(node.id, { addToPrevious: adds.checked ? true : undefined });
        changed();
      });
      parts.push(h(doc, "div", { class: "field checkbox" }, adds, h(doc, "label", { for: "ed-add-previous" }, t("editor.addToPrevious"))), h(doc, "p", { class: "hint" }, t("editor.addToPreviousHelp")));
    }
    if (node.agent === "debater") {
      const debaterName = h(doc, "input", { id: "ed-name", type: "text", maxlength: 40, value: node.name ?? "" });
      debaterName.addEventListener("input", () => {
        editor.setNode(node.id, { name: debaterName.value });
        onChange();
      });
      debaterName.addEventListener("change", () => draw());
      parts.push(field("ed-name", t("editor.name"), debaterName));
      const stance = h(doc, "select", { id: "ed-stance" }, ...["", "for", "against"].map((s) => h(doc, "option", { value: s, selected: (node.stance ?? "") === s }, t(`editor.stance.${s || "none"}`))));
      stance.addEventListener("change", () => {
        editor.setNode(node.id, { stance: stance.value === "" ? undefined : stance.value });
        changed();
      });
      parts.push(field("ed-stance", t("editor.stance"), stance));
    }
    return h(doc, "section", { class: "editor-settings", "aria-label": t("editor.settings", { name: nodeLabel(node) }) }, ...parts);
  }

  // Evaluator loop: the switch that lets the writer judge its own draft (the evaluator then goes away).
  function selfCritiqueBlock(design) {
    if (design.pattern !== "evaluator") return "";
    const box = h(doc, "input", { id: "ed-self-critique", type: "checkbox", checked: editor.selfCritique(), "data-ui": "self-critique-switch" });
    box.addEventListener("change", () => {
      editor.setSelfCritique(box.checked);
      selectedId = null;
      connectFrom = null;
      changed();
    });
    return h(doc, "div", { class: "field checkbox self-critique-field", "data-ui": "self-critique-field" }, box, h(doc, "label", { for: "ed-self-critique" }, t("editor.selfCritique")), helpIcon({ doc, t, id: "create-selfcritique", name: t("editor.selfCritique") }), h(doc, "p", { class: "hint" }, t("editor.selfCritiqueHelp")));
  }

  function roundsBlock(design) {
    if (design.pattern !== "debate") return "";
    const input = h(doc, "input", { id: "ed-rounds", type: "number", min: 1, max: 4, step: 1, value: design.rounds });
    input.addEventListener("change", () => {
      editor.setRounds(Number(input.value));
      changed();
    });
    return h(doc, "div", { class: "field" }, h(doc, "label", { for: "ed-rounds" }, t("editor.rounds")), input);
  }

  function problemsBlock() {
    const errors = editor.errors();
    if (errors.length === 0) return h(doc, "p", { class: "notice ok", role: "status" }, t("editor.ready"));
    return h(doc, "div", { class: "notice", role: "status" }, h(doc, "strong", {}, t("editor.problems")), h(doc, "ul", {}, ...errors.map((e) => h(doc, "li", {}, errorText(e.code, e.params)))));
  }

  function draw() {
    const focusKey = doc.activeElement?.getAttribute?.("data-focus-key");
    const design = editor.design();
    root.replaceChildren(
      h(doc, "p", { class: "hint" }, t("editor.hint")),
      notice ? h(doc, "p", { class: "notice", role: "alert" }, notice) : "",
      paletteBlock(design),
      selfCritiqueBlock(design),
      diagramBlock(design),
      h(doc, "div", { class: "editor-lower" }, settingsBlock(design)),
      roundsBlock(design),
      problemsBlock(),
    );
    if (focusKey) root.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
  }

  const onKeydown = (event) => {
    const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(event.target?.tagName);
    if ((event.key === "Delete" || event.key === "Backspace") && !inField && selectedId !== null) {
      event.preventDefault();
      removeSelected();
      return;
    }
    if (event.key === "Escape" && connectFrom !== null) {
      connectFrom = null;
      draw();
    }
  };
  root.addEventListener("keydown", onKeydown);
  draw();

  return {
    // Selects an agent from outside (the team preview of step 1) and draws it.
    select(id) {
      if (!editor.design().nodes.some((n) => n.id === id)) return;
      selectedId = id;
      connectFrom = null;
      draw();
    },
    refresh() {
      if (!editor.design().nodes.some((n) => n.id === selectedId)) selectedId = null;
      connectFrom = null;
      notice = "";
      draw();
    },
    destroy() {
      root.removeEventListener("keydown", onKeydown);
      container.replaceChildren();
    },
  };
}
