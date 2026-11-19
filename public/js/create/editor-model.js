// The diagram editor's state and rules. Pure: no DOM. The rules mirror validateDesign, so
// the editor refuses a connection the server would refuse anyway, with the same error code.
import { AGENT_TYPES, DEFAULT_MODEL, NODE_MAX, CREATOR_TYPES, INSTRUCTIONS_MAX } from "../engine/catalog.js";
import { createCapFor } from "../engine/created.js";
import { validateDesign } from "../engine/patterns.js";
import { cleanNodeLimits } from "../engine/agent-limits.js";
import { NOTEBOOK_CHOICES, mayWrite } from "../engine/notebook.js";
import { mayCondense } from "../engine/condense.js";
import { cleanFormat, mayFormat } from "../engine/format.js";
import { cleanGuardrails, mayGuard } from "../engine/guardrails.js";

const ONCE_ONLY = new Set(["supervisor", "combiner", "judge", "evaluator", "router", "tally", "splitter", "worker", "reducer", "executor"]);
const EDITABLE = ["model", "slot", "custom", "search", "name", "instructions", "stance", "addToPrevious", "limits", "onLimit", "approve", "notebook", "condense", "creates", "format", "guardrails"];
const DEFAULT_ROUNDS = 2;
const EVALUATOR_ROUNDS = 3;
const roundsFor = (pattern) => (pattern === "evaluator" ? EVALUATOR_ROUNDS : DEFAULT_ROUNDS);

// A node carries limits and onLimit only when they are set: the limits are cleaned, and an onLimit of stop (the default) is left out.
function tidyLimits(node, pattern) {
  const limits = cleanNodeLimits(node.limits);
  if (limits) node.limits = limits;
  else delete node.limits;
  if (node.onLimit !== "pass") delete node.onLimit;
  if (node.approve !== true) delete node.approve;
  if (node.condense !== true || !mayCondense(node.agent, pattern)) delete node.condense;
}

// The answer format: kept cleaned, and only on an agent that may have one (see engine/format.js). Anything else removes it.
function tidyFormat(node, pattern) {
  if (node.format === undefined) return;
  const clean = mayFormat(node.agent, pattern) ? cleanFormat(node.format) : null;
  if (clean) node.format = clean;
  else delete node.format;
}

// The guardrails: kept cleaned (see engine/guardrails.js), and only on an agent that may have them. Anything else removes them.
function tidyGuardrails(node, pattern) {
  if (node.guardrails === undefined) return;
  const clean = mayGuard(node.agent, pattern) ? cleanGuardrails(node.guardrails) : null;
  if (clean) node.guardrails = clean;
  else delete node.guardrails;
}

// The ability to create agents (a Supervisor or a Planner only): kept as { max, guidance, search }, with the cap within 1 and
// the room the run has (the agents of the design and the cap never exceed NODE_MAX). Null, a wrong type or no room removes it.
function tidyCreates(node, count) {
  if (node.creates === undefined) return;
  const c = node.creates;
  const room = createCapFor(count);
  if (c === null || typeof c !== "object" || !CREATOR_TYPES.includes(node.agent) || room < 1) {
    delete node.creates;
    return;
  }
  const max = Math.trunc(Number(c.max));
  node.creates = { max: Math.max(1, Math.min(room, Number.isFinite(max) ? max : 1)), guidance: typeof c.guidance === "string" ? c.guidance.slice(0, INSTRUCTIONS_MAX) : "", search: c.search === true };
}

export function createEditor(initialPattern) {
  let pattern = initialPattern;
  let nodes = [];
  let edges = [];
  let rounds = roundsFor(pattern);
  let criteria = "";
  let notebook = false; // the shared notebook of the run is switched on
  let selfCritique = false; // evaluator loop: the writer judges its own draft (there is no evaluator)
  let start; // handoff: the id of the agent that begins
  let positions = {};
  // The default model: { slot, model }. A new agent starts with it, and so does every agent that has not been
  // given a model of its own (custom is not true).
  let defaultModel = null;

  const find = (id) => nodes.find((n) => n.id === id);
  // What an agent may choose for the notebook: an agent whose reply is a decision may only read.
  const choicesFor = (node) => (mayWrite(node.agent, pattern) ? [...NOTEBOOK_CHOICES] : ["none", "read"]);
  const defaultChoice = (node) => (mayWrite(node.agent, pattern) ? "both" : "read");
  // An agent that can be added only once. In an evaluator loop that is also the writer.
  const onceOnly = (agent) => ONCE_ONLY.has(agent) || (pattern === "evaluator" && agent === "writer") || (pattern === "planexec" && agent === "planner");
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
      if (notebook) copy.memory = { notebook: true };
      else for (const node of copy.nodes) delete node.notebook;
      if (pattern === "debate") copy.rounds = rounds;
      if (pattern === "handoff" && start !== undefined) copy.start = start;
      if (pattern === "evaluator") {
        copy.rounds = rounds;
        copy.criteria = criteria;
        if (selfCritique) copy.selfCritique = true;
      }
      return copy;
    },

    // Evaluator loop: the writer judges its own draft. On, the evaluator and its arrow go away; off, they come back.
    selfCritique() {
      return selfCritique;
    },
    setSelfCritique(on) {
      if (pattern !== "evaluator") return;
      selfCritique = on === true;
      if (selfCritique) {
        nodes = nodes.filter((n) => n.agent !== "evaluator");
        edges = [];
        for (const id of Object.keys(positions)) if (!find(id)) delete positions[id];
      } else if (!nodes.some((n) => n.agent === "evaluator")) {
        const added = this.addNode("evaluator");
        const writer = nodes.find((n) => n.agent === "writer");
        if (added.ok && writer) edges.push({ from: writer.id, to: added.id });
      }
    },

    addNode(agent, overrides = {}) {
      const type = AGENT_TYPES[agent];
      if (!type) return { ok: false, code: "node.agent" };
      if (!type.patterns.includes(pattern)) return { ok: false, code: "node.agentNotAllowed" };
      if (nodes.length >= NODE_MAX) return { ok: false, code: "node.count" };
      if (selfCritique && agent === "evaluator") return { ok: false, code: "node.agentNotAllowed" };
      if (onceOnly(agent) && nodes.some((n) => n.agent === agent)) return { ok: false, code: "node.duplicate" };
      // A voting run has the tally and at most five voters.
      if (pattern === "voting" && nodes.length >= 6) return { ok: false, code: "vote.voters" };
      const node = { id: nextId(agent), agent, model: defaultModel?.model ?? DEFAULT_MODEL, search: type.searchDefault };
      if (defaultModel) node.slot = defaultModel.slot;
      if (type.free) {
        node.name = "";
        node.instructions = "";
      }
      for (const key of EDITABLE) if (key in overrides) node[key] = overrides[key];
      if (notebook && !choicesFor(node).includes(node.notebook)) node.notebook = defaultChoice(node);
      tidyLimits(node, pattern);
      tidyFormat(node, pattern);
      tidyGuardrails(node, pattern);
      nodes.push(node);
      for (const n of nodes) tidyCreates(n, nodes.length);
      if (pattern === "handoff" && start === undefined) start = node.id;
      return { ok: true, id: node.id };
    },

    removeNode(id) {
      nodes = nodes.filter((n) => n.id !== id);
      edges = edges.filter((e) => e.from !== id && e.to !== id);
      for (const n of nodes) tidyCreates(n, nodes.length);
      delete positions[id];
      if (start === id) start = nodes[0]?.id;
    },

    // Handoff: the agent that begins the run. An unknown id is ignored.
    setStart(id) {
      if (find(id)) start = id;
    },

    start() {
      return start;
    },

    setNode(id, patch) {
      const node = find(id);
      if (!node) return;
      for (const key of EDITABLE) if (key in patch && (key !== "notebook" || choicesFor(node).includes(patch.notebook))) node[key] = patch[key];
      tidyLimits(node, pattern);
      tidyFormat(node, pattern);
      tidyGuardrails(node, pattern);
      tidyCreates(node, nodes.length);
    },

    // The shared notebook of the run. Switching it on gives every agent its default choice, switching it off takes the choices away.
    notebookOn() {
      return notebook;
    },
    setNotebook(on) {
      notebook = on === true;
      for (const node of nodes) {
        if (notebook) node.notebook = defaultChoice(node);
        else delete node.notebook;
      }
    },
    notebookChoices(id) {
      const node = find(id);
      return node ? choicesFor(node) : [];
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
      } else if (pattern === "router") {
        if (!(a.agent === "router" && b.agent !== "router")) code = "rout.edges";
      } else if (pattern === "voting") {
        if (!(b.agent === "tally" && a.agent !== "tally")) code = "vote.edges";
      } else if (pattern === "mapreduce") {
        // Only the two arrows of the line: splitter to worker, worker to reducer.
        if (!((a.agent === "splitter" && b.agent === "worker") || (a.agent === "worker" && b.agent === "reducer"))) code = "map.edges";
      } else if (pattern === "planexec") {
        if (!(a.agent === "planner" && b.agent === "executor")) code = "plan.edges";
      } else if (pattern === "handoff") {
        // Any two different agents may be joined, in either direction: an arrow means "may hand over to".
      } else if (pattern === "evaluator") {
        if (!(a.agent === "writer" && b.agent === "evaluator") || edges.length > 0 || selfCritique) code = "eval.edges";
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
        allowed: type.patterns.includes(pattern) && !(onceOnly(agent) && nodes.some((n) => n.agent === agent)),
      }));
    },

    errors() {
      return validateDesign(this.design()).errors;
    },

    setRounds(n) {
      if (Number.isInteger(n)) rounds = n;
    },

    setCriteria(text) {
      if (typeof text === "string") criteria = text;
    },

    criteria() {
      return criteria;
    },

    // Starts the pattern from nothing. An evaluator loop always has the same two agents and one edge, so it starts with
    // them already in place, and with the example criteria the caller gives.
    reset(nextPattern, { criteria: example = "" } = {}) {
      pattern = nextPattern;
      nodes = [];
      edges = [];
      rounds = roundsFor(nextPattern);
      criteria = nextPattern === "evaluator" ? example : "";
      positions = {};
      start = undefined;
      selfCritique = false;
      // The one agent these patterns cannot run without is placed for you; the agents around it are added by the student.
      if (nextPattern === "parallel") this.addNode("combiner");
      if (nextPattern === "supervisor") this.addNode("supervisor");
      if (nextPattern === "debate") this.addNode("judge");
      if (nextPattern === "router") this.addNode("router");
      if (nextPattern === "voting") this.addNode("tally");
      // These patterns always have the same agents and arrows, so they start with them in place.
      if (nextPattern === "mapreduce") {
        for (const agent of ["splitter", "worker", "reducer"]) this.addNode(agent);
        edges.push({ from: "splitter", to: "worker" }, { from: "worker", to: "reducer" });
      }
      if (nextPattern === "planexec") {
        this.addNode("planner");
        this.addNode("executor");
        edges.push({ from: "planner", to: "executor" });
      }
      if (nextPattern === "evaluator") {
        this.addNode("writer");
        this.addNode("evaluator");
        edges.push({ from: "writer", to: "evaluator" });
      }
    },
  };
}

// True when the design holds only what a fresh start of its pattern places, so no work of the student is in it.
export function isUntouched(design) {
  const fresh = createEditor(design.pattern);
  fresh.reset(design.pattern);
  const start = fresh.design();
  const key = (d) => JSON.stringify([d.nodes.map((n) => [n.agent, n.creates !== undefined]), d.edges.map((e) => `${e.from}>${e.to}`)]);
  return key(design) === key(start);
}

// Places nodes on a small fixed grid. "rank" is the direction of flow; "offset" is across it.
// Vertical flow goes top to bottom (rank is y), horizontal goes left to right (rank is x).
export function layoutDesign(design, { orientation = "vertical" } = {}) {
  const { nodes, edges, pattern } = design;
  const connected = new Set(edges.flatMap((e) => [e.from, e.to]));
  const spots = new Map(); // id -> { rank, offset }

  // Map-reduce and plan-and-execute are a line of boxes, laid out like a chain.
  if (pattern === "sequential" || pattern === "mapreduce" || pattern === "planexec") {
    const incoming = new Map(nodes.map((n) => [n.id, 0]));
    for (const e of edges) incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
    let level = nodes.filter((n) => connected.has(n.id) && incoming.get(n.id) === 0).map((n) => n.id);
    for (let rank = 0; level.length > 0 && rank <= nodes.length; rank++) {
      level.forEach((id, offset) => spots.set(id, { rank, offset }));
      level = edges.filter((e) => level.includes(e.from) && !spots.has(e.to)).map((e) => e.to);
    }
  } else if (pattern === "handoff") {
    // By distance from the start: the start first, the agents it hands to next, and so on. Agents never reached go after.
    const first = nodes.some((n) => n.id === design.start) ? design.start : nodes[0]?.id;
    let level = first === undefined ? [] : [first];
    for (let rank = 0; level.length > 0 && rank <= nodes.length; rank++) {
      level.forEach((id, offset) => spots.set(id, { rank, offset }));
      level = [...new Set(edges.filter((e) => level.includes(e.from) && !spots.has(e.to)).map((e) => e.to))];
    }
  } else {
    const hubAgent = { parallel: "combiner", supervisor: "supervisor", debate: "judge", evaluator: "evaluator", router: "router", voting: "tally" }[pattern];
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
    const hubFirst = pattern === "supervisor" || pattern === "router";
    const spokeRank = hubFirst ? 1 : 0;
    const hubRank = hubFirst ? 0 : 1;
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
