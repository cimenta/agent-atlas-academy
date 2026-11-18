// A node that runs several times in one run (the worker of map-reduce, the executor of plan-and-execute). Each run
// is its own agent with the id "<node>#<n>" (n from 1), made from the node the first time it is asked for.
export const instanceId = (id, n) => `${id}#${n}`;
export const nodeIdOf = (id) => String(id).split("#")[0];
// The agent type that runs once for every part or step in a pattern. The orchestrator makes no agent of it up front.
export const MULTI_RUN = { mapreduce: "worker", planexec: "executor" };

// make(node) builds the agent of an instance; the node it gets is a copy of the design's node with the instance id.
export function createSpawner({ design, make }) {
  const made = new Map();
  return function spawn(nodeId, n) {
    const node = Array.isArray(design?.nodes) ? design.nodes.find((x) => x.id === nodeId) : null;
    if (!node) throw new Error(`spawn: no node ${nodeId}`);
    if (!Number.isInteger(n) || n < 1) throw new Error("spawn: the number of a run starts at 1");
    const id = instanceId(nodeId, n);
    if (!made.has(id)) made.set(id, make({ ...node, id }));
    return made.get(id);
  };
}
