// The diagram editor on screen: palette, diagram with arrows, settings for one agent, and the
// list of rules the design still breaks. All rules live in editor-model.js; this file only draws.
import { h } from "../dom.js";
import { helpIcon } from "../help-popup.js";
import { agentLabel } from "../engine/labels.js";
import { AGENT_TYPES, CRITERIA_MAX, MODELS, LIMIT_DEFAULTS, OUTPUT_TOKENS } from "../engine/catalog.js";
import { AGENT_LIMIT_KEYS, agentLimitRange } from "../engine/agent-limits.js";
import { TOOLS } from "../engine/tools.js";
import { roleText } from "../engine/prompts.js";
import { mayCondense } from "../engine/condense.js";
import { BOX_H, BOX_W, autoPositions, centerOf as geometryCenter, clipToBox, extentOf, isTwoWay, straight, turnArrows, TWO_WAY_GAP } from "./diagram-geometry.js";

const MOVE_THRESHOLD = 5;
const SVG_NS = "http://www.w3.org/2000/svg";

export function mountEditor(container, { editor, t, doc = document, onChange = () => {}, getModels = (node) => MODELS, modelUi = null, webSearchAllowed = () => true, runLimits = () => ({ ...LIMIT_DEFAULTS, maxOutputTokens: OUTPUT_TOKENS.default }) }) {
  let selectedId = null;
  let limitsOpen = false; // the Limits of this agent block stays open while the visitor works on it
  let connectFrom = null;
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
    const ask = doc.defaultView?.confirm;
    if (doomed && ask && !ask.call(doc.defaultView, t("editor.removeConfirm", { name: nodeLabel(doomed) }))) return;
    freeze();
    editor.removeNode(selectedId);
    selectedId = null;
    connectFrom = null;
    selectedEdge = null;
    changed();
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
    const pos = autoPositions(design, { wide }); // id -> { x, y } top-left in px, updated live while dragging
    for (const node of design.nodes) if (stored[node.id]) pos.set(node.id, stored[node.id]);
    livePos = pos;
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
    defs.append(marker);
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
    for (const [k, v] of Object.entries({ "stroke-width": "2", stroke: "currentColor", "stroke-dasharray": "6 4", "marker-end": "url(#arrowhead)", visibility: "hidden" })) rubber.setAttribute(k, v);
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
      drawTurns();
      for (const edge of design.edges) {
        const a = centerOf(edge.from);
        const b = centerOf(edge.to);
        const start = clip(b, a);
        const end = clip(a, b);
        const key = `${edge.from}>${edge.to}`;
        const selected = selectedEdge === key;
        // Between a supervisor and a worker the data goes both ways: one connection, drawn with two arrows side by side.
        // In a handoff an edge that has a reverse edge moves aside, so the two arrows run side by side.
        const sideBySide = design.pattern === "handoff" && design.edges.some((o) => o.from === edge.to && o.to === edge.from);
        const gap = isTwoWay(design) || sideBySide ? -TWO_WAY_GAP : 0;
        const shown = isTwoWay(design) ? [[edge.from, edge.to], [edge.to, edge.from]] : [[edge.from, edge.to]];
        const lines = shown.map(([from, to]) => {
          const line = doc.createElementNS(SVG_NS, "line");
          for (const [k, v] of Object.entries({ "marker-end": "url(#arrowhead)", "stroke-width": selected ? "4" : "2", stroke: selected ? "var(--accent)" : "currentColor" })) line.setAttribute(k, v);
          const s2 = straight(pos, from, to, gap);
          setLine(line, { x: s2.x1, y: s2.y1 }, { x: s2.x2, y: s2.y2 });
          return line;
        });
        const hit = doc.createElementNS(SVG_NS, "line");
        for (const [k, v] of Object.entries({ stroke: "transparent", "stroke-width": "22", class: "edge-hit" })) hit.setAttribute(k, v);
        if (sideBySide) {
          const own = straight(pos, edge.from, edge.to, gap);
          setLine(hit, { x: own.x1, y: own.y1 }, { x: own.x2, y: own.y2 });
        } else setLine(hit, start, end);
        hit.addEventListener("click", () => {
          selectedEdge = selectedEdge === key ? null : key;
          selectedId = null;
          draw();
        });
        for (const line of lines) {
          svg.insertBefore(line, rubber);
          edgeParts.push(line);
        }
        svg.insertBefore(hit, rubber);
        edgeParts.push(hit);
        if (selected) {
          const mid = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
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

    // Dragging from a node's port draws a line to the pointer; drop it on another node to connect.
    function wirePort(port, id) {
      let drag = null;
      const areaPoint = (event) => {
        const r = area.getBoundingClientRect();
        return { x: event.clientX - r.left, y: event.clientY - r.top };
      };
      const targetAt = (event) => doc.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-node-id]")?.getAttribute("data-node-id") ?? null;
      const clearMarks = () => nodeEls.forEach((el) => el.removeAttribute("data-target"));
      port.addEventListener("pointerdown", (event) => {
        if (event.button !== undefined && event.button > 0) return;
        drag = { px: event.clientX, py: event.clientY, moved: false };
        port.setPointerCapture?.(event.pointerId);
      });
      port.addEventListener("pointermove", (event) => {
        if (!drag) return;
        if (!drag.moved && Math.hypot(event.clientX - drag.px, event.clientY - drag.py) < MOVE_THRESHOLD) return;
        drag.moved = true;
        setLine(rubber, centerOf(id), areaPoint(event));
        rubber.setAttribute("visibility", "visible");
        clearMarks();
        const over = targetAt(event);
        if (over && over !== id) nodeEls.get(over)?.setAttribute("data-target", editor.canConnect(id, over).ok ? "ok" : "no");
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
        { type: "button", class: "dnode-body", "data-focus-key": `node-${node.id}`, "aria-pressed": String(selectedId === node.id), "aria-label": t("editor.selectNode", { name: nodeLabel(node) }) },
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
      const port = h(doc, "button", { type: "button", class: AGENT_TYPES[node.agent]?.free ? "dnode-port free" : "dnode-port", "data-focus-key": `connect-${node.id}`, "aria-pressed": String(connectFrom === node.id), "aria-label": t("editor.connectFrom", { name: nodeLabel(node) }), title: t("editor.portHelp") }, "→");
      port.addEventListener("click", () => {
        if (suppressClick) return;
        connectFrom = connectFrom === node.id ? null : node.id;
        selectedId = node.id;
        selectedEdge = null;
        draw();
      });
      const isStart = design.pattern === "handoff" && design.start === node.id;
      const box = h(doc, "div", { class: "dnode", "data-node-id": node.id, "data-selected": String(selectedId === node.id), "data-connecting": String(connectFrom === node.id), ...(isStart ? { "data-start": "true" } : {}) }, body, port);
      if (isStart) box.append(h(doc, "span", { class: "dnode-start", "data-ui": "start-flag" }, `▶ ${t("editor.startFlag")}`));
      if (selectedId === node.id) {
        const cross = h(doc, "button", { type: "button", class: "dnode-remove", "data-focus-key": `delete-${node.id}`, "aria-label": t("editor.removeNamed", { name: nodeLabel(node) }), title: t("editor.remove") }, "×");
        cross.addEventListener("click", () => removeSelected());
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
    const tidy = h(doc, "button", { type: "button", "data-focus-key": "tidy" }, t("editor.tidy"));
    tidy.addEventListener("click", () => {
      editor.clearPositions();
      changed();
    });
    const head = h(doc, "div", { class: "editor-diagram-head" }, h(doc, "h3", {}, t("editor.diagram")), design.nodes.length ? tidy : "");
    return h(doc, "section", { class: "editor-diagram", "aria-label": t("editor.diagram") }, head, empty, connecting, wrap);
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
    const details = h(
      doc,
      "details",
      { class: "agent-limits", "data-ui": "agent-limits", open: limitsOpen || count > 0 },
      h(doc, "summary", {}, limitsIcon(), h(doc, "span", {}, t("editor.limits.title")), count > 0 ? h(doc, "span", { class: "limit-count", "data-ui": "agent-limits-count" }, t("editor.limits.count", { n: count })) : "", h(doc, "span", { class: "limit-spacer" }), h(doc, "span", { class: "limit-hint-open", "data-ui": "agent-limits-hint-open" }, t("editor.limits.open")), h(doc, "span", { class: "limit-hint-close", "data-ui": "agent-limits-hint-close" }, t("editor.limits.close")), h(doc, "span", { class: "limit-chevron", "aria-hidden": "true" })),
      h(doc, "p", { class: "hint" }, t("editor.limits.help")),
      ...rows,
      h(doc, "div", { class: "field" }, h(doc, "label", { for: "ed-on-limit" }, t("editor.limits.onLimit.label")), onLimit),
    );
    details.addEventListener("toggle", () => {
      limitsOpen = details.open;
    });
    return details;
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
    const search = h(doc, "input", { id: "ed-search", type: "checkbox", checked: node.search });
    search.addEventListener("change", () => {
      editor.setNode(node.id, { search: search.checked });
      changed();
    });
    const parts = [h(doc, "h4", {}, t("editor.settings", { name: nodeLabel(node) })), field("ed-model", t("editor.model"), model)];
    if (node.agent === "evaluator") {
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
    const searchRow = h(doc, "div", { class: "field checkbox" }, search, h(doc, "label", { for: "ed-search" }, t("editor.search")));
    // Tools: an agent gets only the tools it needs.
    parts.push(h(doc, "h4", { class: "editor-tools-heading" }, t("editor.toolsHeading"), helpIcon({ doc, t, id: "create-tools", name: t("editor.toolsHeading") })));
    parts.push(searchRow);
    if (TOOLS.web_search?.extraFee) parts.push(h(doc, "p", { class: "notice" }, t("editor.searchFee")));
    parts.push(h(doc, "p", { class: "hint" }, t("editor.toolsNote")));
    if (node.search === true && !webSearchAllowed()) parts.push(h(doc, "p", { class: "limit-warning", "data-ui": "search-off-warning" }, t("editor.searchOffInSettings")));
    // Approval: the run stops before this agent and waits for a click.
    const approve = h(doc, "input", { id: "ed-approve", type: "checkbox", checked: node.approve === true, "data-ui": "agent-approve" });
    approve.addEventListener("change", () => {
      editor.setNode(node.id, { approve: approve.checked });
      changed();
    });
    parts.push(h(doc, "h4", { class: "editor-approval-heading" }, t("editor.approvalHeading"), helpIcon({ doc, t, id: "create-approval", name: t("editor.approvalHeading") })));
    parts.push(h(doc, "div", { class: "field checkbox" }, approve, h(doc, "label", { for: "ed-approve" }, t("editor.approve"))));
    parts.push(h(doc, "p", { class: "hint" }, t("editor.approveNote")));
    // The shared notebook: what this agent may do with it. Only when the run has the notebook switched on.
    if (editor.notebookOn()) {
      const choices = editor.notebookChoices(node.id);
      parts.push(h(doc, "h4", { class: "editor-notebook-heading" }, t("editor.notebookHeading"), helpIcon({ doc, t, id: "create-memory", name: t("editor.notebookHeading") })));
      const group = h(doc, "div", { class: "field", role: "radiogroup", "aria-label": t("editor.notebookHeading"), "data-ui": "agent-notebook" });
      for (const choice of choices) {
        const radio = h(doc, "input", { id: `ed-notebook-${choice}`, type: "radio", name: "ed-notebook", value: choice, checked: (node.notebook ?? "both") === choice, "data-ui": `notebook-${choice}` });
        radio.addEventListener("change", () => {
          editor.setNode(node.id, { notebook: choice });
          changed();
        });
        group.append(h(doc, "div", { class: "field checkbox" }, radio, h(doc, "label", { for: `ed-notebook-${choice}` }, t(`editor.notebook.${choice}`))));
      }
      parts.push(group, h(doc, "p", { class: "hint" }, t(`editor.notebook.hint.${node.notebook ?? "both"}`)));
      if (choices.length < 4) parts.push(h(doc, "p", { class: "hint", "data-ui": "notebook-decision" }, t("editor.notebook.decision")));
    }
    // Condensing: one extra call shortens what earlier agents wrote before this agent reads it. Not for an agent whose reply is a decision.
    parts.push(h(doc, "h4", { class: "editor-condense-heading" }, t("editor.condenseHeading"), helpIcon({ doc, t, id: "create-memory", name: t("editor.condenseHeading") })));
    if (mayCondense(node.agent, editor.design().pattern)) {
      const condense = h(doc, "input", { id: "ed-condense", type: "checkbox", checked: node.condense === true, "data-ui": "agent-condense" });
      condense.addEventListener("change", () => {
        editor.setNode(node.id, { condense: condense.checked });
        changed();
      });
      parts.push(h(doc, "div", { class: "field checkbox" }, condense, h(doc, "label", { for: "ed-condense" }, t("editor.condense"))));
      parts.push(h(doc, "p", { class: "hint" }, t("editor.condenseHint")));
    } else {
      parts.push(h(doc, "p", { class: "hint", "data-ui": "condense-decision" }, t("editor.condenseDecision")));
    }
    parts.push(limitsBlock(node));
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
    const remove = h(doc, "button", { type: "button", class: "danger", "data-focus-key": "remove-node" }, t("editor.remove"));
    remove.addEventListener("click", () => removeSelected());
    parts.push(remove);
    return h(doc, "section", { class: "editor-settings", "aria-label": t("editor.settings", { name: nodeLabel(node) }) }, ...parts);
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
      diagramBlock(design),
      h(doc, "div", { class: "editor-lower" }, settingsBlock(design), h(doc, "section", { class: "editor-connections", "aria-label": t("editor.connections") }, h(doc, "h4", {}, t("editor.connections")), connectionsBlock(design))),
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
