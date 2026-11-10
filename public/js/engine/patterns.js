// The rules of the four orchestration patterns. validateDesign is used by the
// editor in the browser and again by the server, which never trusts the browser.
import { AGENT_TYPES, MODELS, LIMIT_DEFAULTS, LIMIT_MAX, NODE_MAX, NAME_MAX, INSTRUCTIONS_MAX } from "./catalog.js";

export const PATTERNS = ["sequential", "parallel", "supervisor", "debate"];

const ID = /^[a-z0-9-]{1,32}$/;
const MODEL_KEYS = new Set(MODELS.map((m) => m.key));
const EDGE_MAX = NODE_MAX * NODE_MAX;
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

export function validateDesign(design) {
  const errors = [];
  const add = (code, params) => errors.push(params ? { code, params } : { code });
  const finish = () => ({ ok: errors.length === 0, errors });

  if (!isObject(design) || !PATTERNS.includes(design.pattern) || !Array.isArray(design.nodes) || !Array.isArray(design.edges)) {
    add("design.shape");
    return finish();
  }
  const { pattern, nodes, edges } = design;

  if (nodes.length === 0 || nodes.length > NODE_MAX) {
    add("node.count");
    return finish();
  }
  if (edges.length > EDGE_MAX) {
    add("edge.count");
    return finish();
  }

  const ids = new Set();
  const goodNodes = [];
  for (const node of nodes) {
    if (!isObject(node)) {
      add("node.id");
      continue;
    }
    if (typeof node.id !== "string" || !ID.test(node.id)) add("node.id");
    else if (ids.has(node.id)) add("node.duplicate", { id: node.id });
    else {
      ids.add(node.id);
      goodNodes.push(node);
    }
    const type = AGENT_TYPES[node.agent];
    if (!type) add("node.agent", { id: node.id });
    else if (!type.patterns.includes(pattern)) add("node.agentNotAllowed", { id: node.id, agent: node.agent });
    if (!MODEL_KEYS.has(node.model)) add("node.model", { id: node.id });
    if (node.name !== undefined && (typeof node.name !== "string" || node.name.length > NAME_MAX)) add("node.name", { id: node.id });
    if (node.instructions !== undefined) {
      const ok = typeof node.instructions === "string" && node.instructions.length <= INSTRUCTIONS_MAX && type && type.free;
      if (!ok) add("node.instructions", { id: node.id });
    }
    if (typeof node.search !== "boolean") add("node.search", { id: node.id });
    if (node.stance !== undefined && node.stance !== "for" && node.stance !== "against") add("node.stance", { id: node.id });
    // Only a critic in a chain can add its notes to the output of the agent before it.
    if (node.addToPrevious !== undefined && !(node.addToPrevious === true && node.agent === "critic" && (pattern === "sequential" || pattern === "parallel"))) add("node.addToPrevious", { id: node.id });
  }

  const goodEdges = [];
  const seen = new Set();
  for (const edge of edges) {
    if (!isObject(edge) || !ids.has(edge.from) || !ids.has(edge.to)) {
      add("edge.unknownNode");
      continue;
    }
    if (edge.from === edge.to) {
      add("edge.self", { id: edge.from });
      continue;
    }
    const key = `${edge.from}>${edge.to}`;
    if (seen.has(key)) {
      add("edge.duplicate", { from: edge.from, to: edge.to });
      continue;
    }
    seen.add(key);
    goodEdges.push(edge);
  }

  const byAgent = (agent) => goodNodes.filter((n) => n.agent === agent);
  const others = (agent) => goodNodes.filter((n) => n.agent !== agent);
  // Every edge must go from a member of `from` to the single hub, once per member.
  const hubEdgesOk = (members, hub, toHub) => {
    if (goodEdges.length !== members.length) return false;
    const covered = new Set();
    for (const edge of goodEdges) {
      const from = toHub ? edge.from : edge.to;
      const to = toHub ? edge.to : edge.from;
      if (to !== hub.id || !members.some((m) => m.id === from) || covered.has(from)) return false;
      covered.add(from);
    }
    return true;
  };

  if (pattern === "sequential") {
    if (!chainOrder(goodNodes, goodEdges)) add("seq.notChain");
  } else if (pattern === "parallel") {
    const combiners = byAgent("combiner");
    const parts = parallelParts(goodNodes, goodEdges);
    if (combiners.length !== 1) add("par.combiner");
    if ((parts ? parts.workers.length : others("combiner").length) < 2) add("par.workers");
    if (combiners.length === 1 && !parts) add("par.edges");
  } else if (pattern === "supervisor") {
    const supervisors = byAgent("supervisor");
    const workers = others("supervisor");
    if (supervisors.length !== 1) add("sup.supervisor");
    if (workers.length < 1) add("sup.workers");
    if (supervisors.length === 1 && !hubEdgesOk(workers, supervisors[0], false)) add("sup.edges");
  } else {
    const debaters = byAgent("debater");
    const judges = byAgent("judge");
    if (debaters.length < 2) add("deb.debaters");
    if (judges.length !== 1) add("deb.judge");
    if (judges.length === 1 && !hubEdgesOk(debaters, judges[0], true)) add("deb.edges");
    if (!Number.isInteger(design.rounds) || design.rounds < 1 || design.rounds > 4) add("deb.rounds");
  }
  return finish();
}

// The parts of a parallel design: workers that all feed the one combiner, and an optional line
// of agents after the combiner, each passing its result to the next. Null when the edges do not
// fit that shape (or there is not exactly one combiner).
export function parallelParts(nodes, edges) {
  const hubs = nodes.filter((n) => n.agent === "combiner");
  if (hubs.length !== 1) return null;
  const hub = hubs[0];
  const followers = [];
  let current = hub.id;
  for (;;) {
    const outgoing = edges.filter((e) => e.from === current);
    if (outgoing.length === 0) break;
    if (outgoing.length > 1) return null;
    const next = outgoing[0].to;
    if (next === hub.id || followers.includes(next)) return null;
    followers.push(next);
    current = next;
  }
  const line = new Set([hub.id, ...followers]);
  const workers = nodes.filter((n) => !line.has(n.id));
  const feeding = edges.filter((e) => !line.has(e.from));
  const covered = new Set();
  for (const e of feeding) {
    if (e.to !== hub.id || covered.has(e.from)) return null;
    covered.add(e.from);
  }
  if (feeding.length !== workers.length || workers.some((w) => !covered.has(w.id))) return null;
  return { hub, workers, followers };
}

// Node ids from start to end when the edges form one path through all nodes, else null.
function chainOrder(nodes, edges) {
  if (nodes.length === 0 || edges.length !== nodes.length - 1) return null;
  const next = new Map();
  const hasIncoming = new Set();
  for (const edge of edges) {
    if (next.has(edge.from) || hasIncoming.has(edge.to)) return null;
    next.set(edge.from, edge.to);
    hasIncoming.add(edge.to);
  }
  const starts = nodes.filter((n) => !hasIncoming.has(n.id));
  if (starts.length !== 1) return null;
  const order = [];
  let current = starts[0].id;
  while (current !== undefined && order.length <= nodes.length) {
    order.push(current);
    current = next.get(current);
  }
  return order.length === nodes.length ? order : null;
}

export function orderOf(design) {
  if (!isObject(design) || !Array.isArray(design.nodes) || !Array.isArray(design.edges)) return [];
  return chainOrder(design.nodes, design.edges) ?? [];
}

export function clampLimits(limits) {
  const source = isObject(limits) ? limits : {};
  const pick = (key, minimum) => {
    const value = source[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) return LIMIT_DEFAULTS[key];
    return Math.min(Math.floor(value), LIMIT_MAX[key]);
  };
  return { maxSteps: pick("maxSteps", 1), maxTokens: pick("maxTokens", 1), maxSearches: pick("maxSearches", 0) };
}
