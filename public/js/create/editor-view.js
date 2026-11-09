// The diagram editor on screen: palette, diagram with arrows, settings for one agent, and the
// list of rules the design still breaks. All rules live in editor-model.js; this file only draws.
import { h } from "../dom.js";
import { AGENT_TYPES, MODELS } from "../engine/catalog.js";
import { TOOLS } from "../engine/tools.js";
import { layoutDesign } from "./editor-model.js";

const CELL_W = 160;
const CELL_H = 96;
const BOX_W = 132;
const BOX_H = 60;
const SVG_NS = "http://www.w3.org/2000/svg";

export function mountEditor(container, { editor, t, doc = document, onChange = () => {} }) {
  let selectedId = null;
  let connectFrom = null;
  let notice = "";
  let dragFrom = null;

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
    const result = editor.addNode(agent);
    if (!result.ok) return refuse(result.code), draw();
    notice = "";
    selectedId = result.id;
    changed();
  }

  function tryConnect(from, to) {
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
    return h(doc, "section", { class: "editor-palette", "aria-label": t("editor.palette") }, h(doc, "h3", {}, t("editor.palette")), h(doc, "p", { class: "hint" }, t("editor.paletteHelp")), h(doc, "div", { class: "palette-list" }, ...buttons));
  }

  function diagramBlock(design) {
    const orientation = design.pattern === "sequential" ? "vertical" : "horizontal";
    const layout = layoutDesign(design, { orientation });
    const width = Math.max(1, layout.width) * CELL_W;
    const height = Math.max(1, layout.height) * CELL_H;
    const area = h(doc, "div", { class: "diagram", role: "group", "aria-label": t("editor.diagram") });
    area.style.width = `${width}px`;
    area.style.height = `${height}px`;
    const wrap = h(doc, "div", { class: "diagram-wrap" }, area);

    const center = new Map();
    const svg = doc.createElementNS(SVG_NS, "svg");
    svg.setAttribute("class", "diagram-arrows");
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("aria-hidden", "true");
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

    for (const spot of layout.nodes) {
      const node = design.nodes.find((n) => n.id === spot.id);
      const left = spot.x * CELL_W + (CELL_W - BOX_W) / 2;
      const top = spot.y * CELL_H + (CELL_H - BOX_H) / 2;
      center.set(node.id, { x: left + BOX_W / 2, y: top + BOX_H / 2 });
      const body = h(
        doc,
        "button",
        { type: "button", class: "dnode-body", "data-focus-key": `node-${node.id}`, "aria-pressed": String(selectedId === node.id), "aria-label": t("editor.selectNode", { name: nodeLabel(node) }) },
        h(doc, "strong", {}, nodeLabel(node)),
        h(doc, "small", {}, MODELS.find((m) => m.key === node.model)?.label ?? ""),
      );
      body.addEventListener("click", () => onNodeActivate(node.id));
      const connect = h(doc, "button", { type: "button", class: "dnode-connect", "data-focus-key": `connect-${node.id}`, "aria-pressed": String(connectFrom === node.id), "aria-label": t("editor.connectFrom", { name: nodeLabel(node) }) }, "→");
      connect.addEventListener("click", () => {
        connectFrom = connectFrom === node.id ? null : node.id;
        selectedId = node.id;
        draw();
      });
      const handle = h(doc, "span", { class: "dnode-handle", "aria-hidden": "true", title: t("editor.dragHandle", { name: nodeLabel(node) }) }, "●");
      handle.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        dragFrom = node.id;
        handle.setPointerCapture?.(event.pointerId);
      });
      handle.addEventListener("pointerup", (event) => {
        const from = dragFrom;
        dragFrom = null;
        const target = doc.elementFromPoint(event.clientX, event.clientY)?.closest?.("[data-node-id]");
        const to = target?.getAttribute("data-node-id");
        if (from && to && to !== from) tryConnect(from, to);
      });
      const box = h(doc, "div", { class: "dnode", "data-node-id": node.id, "data-selected": String(selectedId === node.id), "data-connecting": String(connectFrom === node.id) }, body, connect, handle);
      box.style.left = `${left}px`;
      box.style.top = `${top}px`;
      box.style.width = `${BOX_W}px`;
      box.style.height = `${BOX_H}px`;
      area.append(box);
    }

    for (const edge of design.edges) {
      const a = center.get(edge.from);
      const b = center.get(edge.to);
      if (!a || !b) continue;
      const clip = (from, to) => {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const scale = Math.min(dx === 0 ? Infinity : BOX_W / 2 / Math.abs(dx), dy === 0 ? Infinity : BOX_H / 2 / Math.abs(dy));
        return { x: to.x - dx * scale, y: to.y - dy * scale };
      };
      const start = clip(b, a);
      const end = clip(a, b);
      const line = doc.createElementNS(SVG_NS, "line");
      for (const [k, v] of Object.entries({ x1: start.x, y1: start.y, x2: end.x, y2: end.y, "marker-end": "url(#arrowhead)", "stroke-width": "2", stroke: "currentColor" })) line.setAttribute(k, String(v));
      svg.append(line);
    }

    area.addEventListener("dragover", (event) => event.preventDefault());
    area.addEventListener("drop", (event) => {
      event.preventDefault();
      const data = event.dataTransfer?.getData("text/plain") ?? "";
      if (data.startsWith("agent:")) addAgent(data.slice(6));
    });

    const empty = design.nodes.length === 0 ? h(doc, "p", { class: "hint" }, t("editor.empty")) : "";
    const connecting = connectFrom
      ? h(doc, "p", { class: "notice", role: "status" }, t("editor.connecting", { name: nodeLabel(design.nodes.find((n) => n.id === connectFrom)) }))
      : "";
    return h(doc, "section", { class: "editor-diagram", "aria-label": t("editor.diagram") }, h(doc, "h3", {}, t("editor.diagram")), empty, connecting, wrap);
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
    if (node.agent === "debater") {
      const stance = h(doc, "select", { id: "ed-stance" }, ...["", "for", "against"].map((s) => h(doc, "option", { value: s, selected: (node.stance ?? "") === s }, t(`editor.stance.${s || "none"}`))));
      stance.addEventListener("change", () => {
        editor.setNode(node.id, { stance: stance.value === "" ? undefined : stance.value });
        changed();
      });
      parts.push(field("ed-stance", t("editor.stance"), stance));
    }
    const remove = h(doc, "button", { type: "button", class: "danger", "data-focus-key": "remove-node" }, t("editor.remove"));
    remove.addEventListener("click", () => {
      editor.removeNode(node.id);
      selectedId = null;
      connectFrom = null;
      changed();
    });
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
      roundsBlock(design),
      h(doc, "h3", {}, t("editor.connections")),
      connectionsBlock(design),
      settingsBlock(design),
      problemsBlock(),
    );
    if (focusKey) root.querySelector(`[data-focus-key="${focusKey}"]`)?.focus();
  }

  const onKeydown = (event) => {
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
