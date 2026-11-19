// Agents that create agents: a Supervisor or a Planner with the ability Creating may make Free agents while a run is going.
// The pure helpers are here; the registry that makes the agents is added below.
import { AGENT_TYPES, CREATE_MAX, CREATOR_TYPES, INSTRUCTIONS_MAX, NAME_MAX, NODE_MAX } from "./catalog.js";

// The id of the n-th created agent (n from 1). It has no "#", so it is found like a node of the design.
export const createdId = (n) => `made-${n}`;

// How many agents a creator may be allowed to create when the design has nodeCount agents.
export const createCapFor = (nodeCount) => Math.max(0, Math.min(CREATE_MAX, NODE_MAX - nodeCount));

// The design as it was after the agents created up to the cursor: their nodes are added, with an edge from the creator.
// The same object when nothing was created, so a caller can tell that nothing changed.
export function designWithCreated(design, events, cursor = events.length) {
  const made = (events ?? []).slice(0, Math.max(0, cursor)).filter((e) => e?.type === "agent_created" && e.node && typeof e.node.id === "string");
  if (!design || made.length === 0) return design;
  return {
    ...design,
    nodes: [...design.nodes, ...made.map((e) => e.node)],
    edges: [...design.edges, ...made.map((e) => ({ from: e.by, to: e.node.id }))],
  };
}

// The registry of one run: checks each request of a creator and makes the agent. `agents` is the Map of agent id to agent
// that the orchestrator keeps; `make(node)` builds an agent from a node. A created agent runs on the model and key of its
// creator, is a Free agent, and has no `creates` of its own, so it can never create agents.
// A refusal is not a failure: the request returns the reason (a short code) and the creator is told.
export function createRegistry({ design, agents, make, emit }) {
  const created = [];
  const labelOf = (n) => String(n.name ?? AGENT_TYPES[n.agent]?.label ?? n.agent).trim().toLowerCase();
  const refuse = (by, reason) => {
    emit({ type: "agent_refused", by, reason });
    return { ok: false, reason };
  };
  return {
    request({ by, name, instructions }) {
      const creator = design.nodes.find((n) => n.id === by);
      const rule = creator?.creates;
      if (!rule || !CREATOR_TYPES.includes(creator.agent)) return refuse(by, "not-allowed");
      const label = typeof name === "string" ? name.trim() : "";
      if (label === "" || label.length > NAME_MAX) return refuse(by, "name");
      if (typeof instructions !== "string" || instructions.trim() === "" || instructions.length > INSTRUCTIONS_MAX) return refuse(by, "instructions");
      if (design.nodes.concat(created).some((n) => labelOf(n) === label.toLowerCase())) return refuse(by, "name-taken");
      if (created.filter((n) => n.by === by).length >= Math.min(rule.max, CREATE_MAX)) return refuse(by, "cap");
      if (design.nodes.length + created.length >= NODE_MAX) return refuse(by, "total");
      const node = { id: createdId(created.length + 1), agent: "free", name: label, instructions: instructions.trim(), model: creator.model, ...(creator.slot !== undefined ? { slot: creator.slot } : {}), search: rule.search === true, created: true, by };
      created.push(node);
      agents.set(node.id, make(node));
      emit({ type: "agent_created", by, agent: node.id, node, n: created.length, max: rule.max });
      return { ok: true, id: node.id, node };
    },
    list: () => created.slice(),
    used: (by) => created.filter((n) => n.by === by).length,
  };
}

// The places a design still has for created agents: [{ by, n, max }] for every creator, numbered from the first free place.
// A design that already holds created agents (see designWithCreated) has fewer places.
export function freePlacesOf(design) {
  const places = [];
  for (const node of design?.nodes ?? []) {
    if (!node.creates) continue;
    const used = design.nodes.filter((n) => n.created === true && n.by === node.id).length;
    for (let n = used + 1; n <= node.creates.max; n++) places.push({ by: node.id, n, max: node.creates.max });
  }
  return places;
}
