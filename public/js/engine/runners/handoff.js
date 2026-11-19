// Handoff: control moves from agent to agent. Each agent either hands over (with a note) or finishes.
import { candidates } from "./supervisor.js";
import { ApprovalPause } from "../approval.js";
import { AGENT_TYPES } from "../catalog.js";
import { agentLabel } from "../labels.js";

// Reads an agent's decision. `allowed` holds the ids it may hand over to. Returns null when the reply is not valid.
export function parseHandoffReply(text, allowed) {
  if (typeof text !== "string" || text.trim() === "") return null;
  for (const candidate of candidates(text)) {
    let data;
    try {
      data = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (data === null || typeof data !== "object" || Array.isArray(data) || typeof data.action !== "string") continue;
    const action = data.action.trim().toLowerCase();
    if (action === "finish" && typeof data.answer === "string" && data.answer.trim() !== "") return { action: "finish", answer: data.answer.trim() };
    if (action === "handoff" && typeof data.to === "string" && allowed.includes(data.to.trim()) && typeof data.note === "string" && data.note.trim() !== "") {
      return { action: "handoff", to: data.to.trim(), note: data.note.trim() };
    }
  }
  return null;
}

// A reply that hands over to an agent it may not hand over to: { to, reason } with the reason no-arrow (the agent exists but
// has no arrow from this one) or unknown (no such agent). Null for any other reply, valid or not.
export function handoffRefusal(text, allowed, ids) {
  if (typeof text !== "string") return null;
  for (const candidate of candidates(text)) {
    let data;
    try {
      data = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (data === null || typeof data !== "object" || Array.isArray(data) || typeof data.action !== "string" || data.action.trim().toLowerCase() !== "handoff" || typeof data.to !== "string") continue;
    const to = data.to.trim();
    if (to === "" || allowed.includes(to)) continue;
    return { to, reason: ids.includes(to) ? "no-arrow" : "unknown" };
  }
  return null;
}

const NOTE_MAX = 2000;

const repairFor = (allowed) =>
  allowed.length === 0 ? 'You cannot hand over to anyone. Reply with valid JSON as instructed, with the action "finish".' : `Reply with valid JSON as instructed. You may hand over only to: ${allowed.join(", ")}.`;

// The starting agent works on the task, then hands control to an agent it has an arrow to (with a note) or finishes.
// The next agent gets the task and the note and nothing else. The run ends when an agent finishes. When a limit of the
// harness or an error ends it, the last note is its result (empty before the first handoff).
export async function run({ design, task, agents, emit, passOn = (text) => text }) {
  const byId = new Map(design.nodes.map((n) => [n.id, n]));
  const labelOf = (id) => agentLabel(byId.get(id), design, AGENT_TYPES[byId.get(id).agent]?.label ?? byId.get(id).agent);
  const targetsOf = (id) => [...new Set(design.edges.filter((e) => e.from === id && byId.has(e.to)).map((e) => e.to))];
  let current = design.start;
  let from = null;
  let note = "";
  try {
    for (;;) {
      const allowed = targetsOf(current);
      const list = allowed.length === 0 ? "You cannot hand over to anyone. Finish the task." : `You may hand over to: ${allowed.map((id) => `${id} (${labelOf(id)})`).join(", ")}`;
      const head = from === null ? `Task: ${task}` : `Task: ${task}\n\nHanded over by ${labelOf(from)}:\n${passOn(note, from)}`;
      let input = `${head}\n\n${list}`;
      let decision = null;
      let refusal = null;
      for (let tries = 0; tries < 2 && !decision; tries++) {
        const reply = (await agents.get(current).run(input)).text;
        decision = parseHandoffReply(reply, allowed);
        input = repairFor(allowed);
        refusal = decision ? null : handoffRefusal(reply, allowed, [...byId.keys()]);
        if (refusal) {
          emit({ type: "handoff_refused", from: current, to: refusal.to, reason: refusal.reason });
          input = `You cannot hand over to ${refusal.to}: ${refusal.reason === "no-arrow" ? "there is no arrow from you to that agent" : "there is no such agent"}. ${input}`;
        }
      }
      if (!decision && refusal) throw new Error(`handoff.refused: ${labelOf(current)} asked twice to hand over to ${refusal.to}, which ${refusal.reason === "no-arrow" ? "it has no arrow to" : "does not exist"}`);
      if (!decision) throw new Error(`handoff.invalid: ${labelOf(current)} did not give a valid decision twice in a row`);
      if (decision.action === "finish") return decision.answer;
      emit({ type: "handoff", from: current, to: decision.to, note: decision.note.slice(0, NOTE_MAX) });
      from = current;
      current = decision.to;
      note = decision.note;
    }
  } catch (error) {
    if (!(error instanceof ApprovalPause)) error.partialText = note;
    throw error;
  }
}
