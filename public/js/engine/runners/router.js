// Router: one agent reads the task and chooses one specialist. The specialist answers; that answer is the result.
import { candidates } from "./supervisor.js";
import { ApprovalPause } from "../approval.js";
import { AGENT_TYPES } from "../catalog.js";
import { agentLabel } from "../labels.js";

const NOTE_MAX = 2000;
const HINT_MAX = 80;

// Reads the router's choice. `allowed` holds the specialist ids. Returns null when the reply is not valid.
export function parseRouterReply(text, allowed) {
  if (typeof text !== "string" || text.trim() === "") return null;
  for (const candidate of candidates(text)) {
    let data;
    try {
      data = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) continue;
    if (typeof data.route === "string" && allowed.includes(data.route.trim()) && typeof data.reason === "string" && data.reason.trim() !== "") {
      return { route: data.route.trim(), reason: data.reason.trim() };
    }
  }
  return null;
}

// The router chooses once. The chosen specialist gets the task and nothing else. When a limit or an error ends the run
// before the specialist has answered, the result is empty (a pause for approval is not an ending).
export async function run({ design, task, agents, emit }) {
  const router = design.nodes.find((n) => n.agent === "router");
  const byId = new Map(design.nodes.map((n) => [n.id, n]));
  const allowed = [...new Set(design.edges.filter((e) => e.from === router.id && byId.has(e.to)).map((e) => e.to))];
  const describe = (id) => {
    const node = byId.get(id);
    const label = agentLabel(node, design, AGENT_TYPES[node.agent]?.label ?? node.agent);
    const hint = node.agent === "free" && typeof node.instructions === "string" && node.instructions.trim() !== "" ? `: ${node.instructions.trim().replace(/\s+/g, " ").replace(/,/g, ";").replace(/[()]/g, "").slice(0, HINT_MAX)}` : "";
    return `${id} (${label}${hint})`;
  };
  try {
    let input = `Task: ${task}\n\nYou may route to: ${allowed.map(describe).join(", ")}`;
    let decision = null;
    for (let tries = 0; tries < 2 && !decision; tries++) {
      decision = parseRouterReply((await agents.get(router.id).run(input)).text, allowed);
      input = `Reply with valid JSON as instructed. You may route only to: ${allowed.join(", ")}.`;
    }
    if (!decision) throw new Error("router.invalid: the router did not give a valid choice twice in a row");
    emit({ type: "handoff", from: router.id, to: decision.route, note: decision.reason.slice(0, NOTE_MAX) });
    return (await agents.get(decision.route).run(`Task: ${task}`)).text;
  } catch (error) {
    if (!(error instanceof ApprovalPause)) error.partialText = "";
    throw error;
  }
}
