// The diagram editor's state and rules. Pure: no DOM. The rules mirror validateDesign, so
// the editor refuses a connection the server would refuse anyway, with the same error code.
import { AGENT_TYPES, DEFAULT_MODEL, NODE_MAX } from "../engine/catalog.js";
import { validateDesign } from "../engine/patterns.js";

const ONCE_ONLY = new Set(["supervisor", "combiner", "judge"]);
const EDITABLE = ["model", "slot", "custom", "search", "name", "instructions", "stance", "addToPrevious"];
const DEFAULT_ROUNDS = 2;

export function createEditor(initialPattern) {
  let pattern = initialPattern;
  let nodes = [];
  let edges = [];
  let rounds = DEFAULT_ROUNDS;
  let positions = {};
  // The default model: { slot, model }. A new agent starts with it, and so does every agent that has not been
  // given a model of its own (custom is not true).
  let defaultModel = null;

  const find = (id) => nodes.find((n) => n.id === id);
  const hasEdge = (from, to) => edges.some((e) => e.from === from && e.to === to);

  function nextId(agent) {
    if (!find(agent)) return agent;
    let n = 2;
    while (find(`${agent}-${n}`)) n += 1;
    return `${agent}-${n}`;
  }

  // Would adding from -> to close a loop in the chain?
  function closesCycle(from, to) {
    let current = to;
    const next = new Map(edges.map((e) => [e.from, e.to]));
    for (let guard = 0; guard <= nodes.length && current !== undefined; guard++) {
      if (current === from) return true;
      current = next.get(current);
    }
    return false;
  }

  return {
    design() {
      const copy = { pattern, nodes: structuredClone(nodes), edges: structuredClone(edges) };
      if (pattern === "debate") copy.rounds = rounds;
      return copy;
    },

    addNode(agent, overrides = {}) {
      const type = AGENT_TYPES[agent];
      if (!type) return { ok: false, code: "node.agent" };
      if (!type.patterns.includes(pattern)) return { ok: false, code: "node.agentNotAllowed" };
      if (nodes.length >= NODE_MAX) return { ok: false, code: "node.count" };
      if (ONCE_ONLY.has(agent) && nodes.some((n) => n.agent === agent)) return { ok: false, code: "node.duplicate" };
      const node = { id: nextId(agent), agent, model: defaultModel?.model ?? DEFAULT_MODEL, search: type.searchDefault };
      if (defaultModel) node.slot = defaultModel.slot;
      if (type.free) {
        node.name = "";
        node.instructions = "";
      }
      for (const key of EDITABLE) if (key in overrides) node[key] = overrides[key];
      nodes.push(node);
      return { ok: true, id: node.id };
    },

    removeNode(id) {
      nodes = nodes.filter((n) => n.id !== id);
      edges = edges.filter((e) => e.from !== id && e.to !== id);
      delete positions[id];
    },

    setNode(id, patch) {
      const node = find(id);
      if (!node) return;
      for (const key of EDITABLE) if (key in patch) node[key] = patch[key];
    },

    defaultModel() {
      return defaultModel ? { ...defaultModel } : null;
    },

    // Sets the default model and gives it to every agent without a model of its own.
    setDefaultModel(choice) {
      defaultModel = { slot: choice.slot, model: choice.model };
      for (const node of nodes) {
        if (node.custom === true) continue;
        node.slot = choice.slot;
        node.model = choice.model;
      }
    },

    // The model of one agent: a choice of its own, or null to follow the default again.
    setNodeModel(id, choice) {
      const node = find(id);
      if (!node) return;
      if (choice === null && defaultModel) {
        node.slot = defaultModel.slot;
        node.model = defaultModel.model;
        delete node.custom;
      } else if (choice) {
        node.slot = choice.slot;
        node.model = choice.model;
        node.custom = true;
      }
    },

    // Agents whose choice is not allowed go back to the default. An agent with no slot yet (from a saved definition)
    // gets the default's slot, keeps its model, and counts as having a model of its own.
    keepSlots(allowed) {
      if (!defaultModel) return;
      for (const node of nodes) {
        if (node.slot === undefined) {
          node.slot = defaultModel.slot;
          node.custom = true;
        }
        if (!allowed(node)) {
          node.slot = defaultModel.slot;
          node.model = defaultModel.model;
          delete node.custom;
        }
      }
    },

    canConnect(from, to) {
      const a = find(from);
      const b = find(to);
      if (!a || !b) return { ok: false, code: "edge.unknownNode" };
      if (from === to) return { ok: false, code: "edge.self" };
      if (hasEdge(from, to)) return { ok: false, code: "edge.duplicate" };
      let code = null;
      if (pattern === "sequential") {
        const taken = edges.some((e) => e.from === from) || edges.some((e) => e.to === to) || closesCycle(from, to);
        if (taken) code = "seq.notChain";
      } else if (pattern === "parallel") {
        // A worker feeds the combiner; after the combiner a line of agents may follow, one at a time.
        const combiner = nodes.find((n) => n.agent === "combiner");
        const touched = (id) => edges.some((e) => e.from === id || e.to === id);
        let tail = combiner?.id;
        for (let guard = 0; guard <= nodes.length; guard++) {
          const out = edges.find((e) => e.from === tail);
          if (!out) break;
          tail = out.to;
        }
        if (b.agent === "combiner") {
          if (a.agent === "combiner" || edges.some((e) => e.to === a.id)) code = "par.edges";
        } else if (!(combiner && from === tail && !touched(to))) code = "par.edges";
      } else if (pattern === "supervisor") {
        if (!(a.agent === "supervisor" && b.agent !== "supervisor")) code = "sup.edges";
      } else if (!(a.agent === "debater" && b.agent === "judge")) {
        code = "deb.edges";
      }
      return code ? { ok: false, code } : { ok: true };
    },

    connect(from, to) {
      const verdict = this.canConnect(from, to);
      if (verdict.ok) edges.push({ from, to });
      return verdict;
    },

    setPosition(id, x, y) {
      if (!find(id)) return;
      positions[id] = { x: Math.max(0, Math.round(x)), y: Math.max(0, Math.round(y)) };
    },

    positions() {
      return structuredClone(positions);
    },

    clearPositions() {
      positions = {};
    },

    disconnect(from, to) {
      edges = edges.filter((e) => !(e.from === from && e.to === to));
    },

    paletteFor() {
      return Object.entries(AGENT_TYPES).map(([agent, type]) => ({
        agent,
        label: type.label,
        allowed: type.patterns.includes(pattern) && !(ONCE_ONLY.has(agent) && nodes.some((n) => n.agent === agent)),
      }));
    },

    errors() {
      return validateDesign(this.design()).errors;
    },

    setRounds(n) {
      if (Number.isInteger(n)) rounds = n;
    },

    reset(nextPattern) {
      pattern = nextPattern;
      nodes = [];
      edges = [];
      rounds = DEFAULT_ROUNDS;
      positions = {};
    },
  };
}

// Places nodes on a small fixed grid. "rank" is the direction of flow; "offset" is across it.
// Vertical flow goes top to bottom (rank is y), horizontal goes left to right (rank is x).
export function layoutDesign(design, { orientation = "vertical" } = {}) {
  const { nodes, edges, pattern } = design;
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  const spots = new Map(); // id -> { rank, offset }

  if (pattern === "sequential") {
    const incoming = new Map(nodes.map((n) => [n.id, 0]));
    for (const e of edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    let level = nodes.filter((n) => connected.has(n.id) && incoming.get(n.id) === 0).map((n) => n.id);
    for (let rank = 0; level.length > 0 && rank <= nodes.length; rank++) {
      level.forEach((id, offset) => spots.set(id, { rank, offset }));
      level = edges.filter((e) => level.includes(e.from) && !spots.has(e.to)).map((e) => e.to);
    }
  } else {
    const hubAgent = { parallel: "combiner", supervisor: "supervisor", debate: "judge" }[pattern];
    const hub = nodes.find((n) => n.agent === hubAgent && connected.has(n.id));
    const followers = [];
    if (pattern === "parallel" && hub) {
      let current = hub.id;
      for (let i = 0; i < nodes.length; i++) {
        const out = edges.find((e) => e.from === current);
        if (!out) break;
        followers.push(out.to);
        current = out.to;
      }
    }
    const spokes = nodes.filter((n) => n.agent !== hubAgent && connected.has(n.id) && !followers.includes(n.id));
    const spokeRank = pattern === "supervisor" ? 1 : 0;
    const hubRank = pattern === "supervisor" ? 0 : 1;
    spokes.forEach((n, offset) => spots.set(n.id, { rank: spokeRank, offset }));
    if (hub) spots.set(hub.id, { rank: hubRank, offset: Math.floor((spokes.length - 1) / 2) });
    followers.forEach((id, i) => spots.set(id, { rank: hubRank + 1 + i, offset: Math.floor((spokes.length - 1) / 2) }));
  }

  const placed = [...spots.values()];
  const maxRank = placed.length ? Math.max(...placed.map((s) => s.rank)) : -1;
  const staged = nodes.filter((n) => !spots.has(n.id));
  staged.forEach((n, offset) => spots.set(n.id, { rank: maxRank < 0 ? 0 : maxRank + 2, offset }));

  const out = nodes.map((n) => {
    const { rank, offset } = spots.get(n.id);
    return orientation === "horizontal" ? { id: n.id, x: rank, y: offset } : { id: n.id, x: offset, y: rank };
  });
  return {
    nodes: out,
    width: out.length ? Math.max(...out.map((n) => n.x)) + 1 : 0,
    height: out.length ? Math.max(...out.map((n) => n.y)) + 1 : 0,
  };
}
