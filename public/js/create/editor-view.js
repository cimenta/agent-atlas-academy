// The diagram editor on screen: palette, diagram with arrows, settings for one agent, and the
// list of rules the design still breaks. All rules live in editor-model.js; this file only draws.
import { h } from "../dom.js";
import { agentLabel } from "../engine/labels.js";
import { AGENT_TYPES, MODELS } from "../engine/catalog.js";
import { TOOLS } from "../engine/tools.js";
import { roleText } from "../engine/prompts.js";
import { BOX_H, BOX_W, autoPositions, centerOf as geometryCenter, clipToBox, extentOf, isTwoWay, straight, turnArrows, TWO_WAY_GAP } from "./diagram-geometry.js";

const MOVE_THRESHOLD = 5;
const SVG_NS = "http://www.w3.org/2000/svg";

export function mountEditor(container, { editor, t, doc = document, onChange = () => {} }) {
  let selectedId = null;
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
    for (const [k, v] of Object.entries({ id: "arrowhead", viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "8", markerHeight: "8", orient: "auto-start-reverse" })) marker.setAttribute(k, v);
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
        const shown = isTwoWay(design) ? [[edge.from, edge.to], [edge.to, edge.from]] : [[edge.from, edge.to]];
        const lines = shown.map(([from, to]) => {
          const line = doc.createElementNS(SVG_NS, "line");
          for (const [k, v] of Object.entries({ "marker-end": "url(#arrowhead)", "stroke-width": selected ? "4" : "2", stroke: selected ? "var(--accent)" : "currentColor" })) line.setAttribute(k, v);
          const s2 = straight(pos, from, to, isTwoWay(design) ? -TWO_WAY_GAP : 0);
          setLine(line, { x: s2.x1, y: s2.y1 }, { x: s2.x2, y: s2.y2 });
          return line;
        });
        const hit = doc.createElementNS(SVG_NS, "line");
        for (const [k, v] of Object.entries({ stroke: "transparent", "stroke-width": "22", class: "edge-hit" })) hit.setAttribute(k, v);
        setLine(hit, start, end);
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
        h(doc, "small", {}, MODELS.find((m) => m.key === node.model)?.label ?? ""),
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
      const box = h(doc, "div", { class: "dnode", "data-node-id": node.id, "data-selected": String(selectedId === node.id), "data-connecting": String(connectFrom === node.id) }, body, port);
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

  function settingsBlock(design) {
    const node = design.nodes.find((n) => n.id === selectedId);
    if (!node) return h(doc, "p", { class: "hint" }, t("editor.pickNode"));
    const type = AGENT_TYPES[node.agent];
    const field = (id, label, input) => h(doc, "div", { class: "field" }, h(doc, "label", { for: id }, label), input);
    const model = h(doc, "select", { id: "ed-model" }, ...MODELS.map((m) => h(doc, "option", { value: m.key, selected: m.key === node.model }, `${m.label} (${m.id})`)));
    model.addEventListener("change", () => {
      editor.setNode(node.id, { model: model.value });
      changed();
    });
    const search = h(doc, "input", { id: "ed-search", type: "checkbox", checked: node.search });
    search.addEventListener("change", () => {
      editor.setNode(node.id, { search: search.checked });
      changed();
    });
    const parts = [h(doc, "h4", {}, t("editor.settings", { name: nodeLabel(node) })), field("ed-model", t("editor.model"), model)];
    const searchRow = h(doc, "div", { class: "field checkbox" }, search, h(doc, "label", { for: "ed-search" }, t("editor.search")));
    parts.push(searchRow);
    if (TOOLS.web_search?.extraFee) parts.push(h(doc, "p", { class: "notice" }, t("editor.searchFee")));
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
          h(doc, "pre", {}, roleText(node)),
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
