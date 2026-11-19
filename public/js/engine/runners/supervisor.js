// Supervisor: one supervisor decides which workers work next and when to finish. It may call several workers
// at once; they then work at the same time and all their results go back to it.
const NOTE_MAX = 2000;
const isText = (v) => typeof v === "string" && v.length > 0;

export function candidates(text) {
  const found = [text];
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced) found.push(fenced[1]);
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first >= 0 && last > first) found.push(text.slice(first, last + 1));
  return found;
}

// Reads the supervisor's reply. Returns null when it is not a valid instruction.
export function parseSupervisorReply(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  for (const candidate of candidates(text)) {
    let data;
    try {
      data = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (data === null || typeof data !== "object") continue;
    if (data.action === "call" && Array.isArray(data.calls) && data.calls.length > 0 && data.calls.every((c) => c && typeof c === "object" && isText(c.worker))) {
      return { action: "call", calls: data.calls.map((c) => ({ worker: c.worker, instruction: typeof c.instruction === "string" ? c.instruction : "" })) };
    }
    if (data.action === "call" && isText(data.worker)) {
      return { action: "call", worker: data.worker, instruction: typeof data.instruction === "string" ? data.instruction : "" };
    }
    if (data.action === "create" && isText(data.name) && isText(data.instructions)) return { action: "create", name: data.name, instructions: data.instructions };
    if (data.action === "finish" && typeof data.answer === "string") return { action: "finish", answer: data.answer };
  }
  return null;
}

// Why a request to create an agent was refused, as the supervisor is told it.
const REFUSED = {
  "not-allowed": "you may not create agents",
  cap: "you have already created all the agents you may create",
  total: "the run has no room for another agent",
  name: "the name must be 1 to 40 characters",
  "name-taken": "an agent with that name exists already",
  instructions: "the instructions must be text of 1 to 2000 characters",
};

// create(request) makes an agent for a supervisor that may (its node has creates); null when nobody may create.
export async function run({ design, task, agents, emit, passOn = (text) => text, create = null }) {
  const supervisor = design.nodes.find((n) => n.agent === "supervisor");
  const workerIds = design.nodes.filter((n) => n.agent !== "supervisor").map((n) => n.id);
  const boss = agents.get(supervisor.id);
  let input = `Task: ${task}\nWorkers: ${workerIds.join(", ")}`;
  const canCreate = create !== null && supervisor.creates !== undefined;
  let refusedInARow = 0;
  let invalidInARow = 0;
  for (;;) {
    const reply = await boss.run(input);
    const parsed = parseSupervisorReply(reply.text);
    if (parsed?.action === "create" && canCreate) {
      invalidInARow = 0;
      const made = create({ by: supervisor.id, name: parsed.name, instructions: parsed.instructions });
      if (!made.ok) {
        refusedInARow += 1;
        if (refusedInARow >= 2) throw new Error("supervisor.refused: the supervisor asked twice in a row to create an agent that is not allowed");
        input = `Creating refused: ${REFUSED[made.reason] ?? made.reason}. Valid workers: ${workerIds.join(", ")}.`;
        continue;
      }
      refusedInARow = 0;
      workerIds.push(made.id);
      input = `Created ${made.node.name} (id ${made.id}). Valid workers now: ${workerIds.join(", ")}.`;
      continue;
    }
    const calls = parsed?.action === "call" ? (parsed.calls ?? [{ worker: parsed.worker, instruction: parsed.instruction }]) : [];
    const usable = parsed && parsed.action !== "create" && (parsed.action === "finish" || (calls.every((c) => workerIds.includes(c.worker)) && new Set(calls.map((c) => c.worker)).size === calls.length));
    if (!usable) {
      invalidInARow += 1;
      refusedInARow = 0;
      if (invalidInARow >= 2) throw new Error("supervisor.invalid: the supervisor did not give a valid instruction twice in a row");
      input = `Reply with valid JSON as instructed. Valid workers: ${workerIds.join(", ")}.`;
      continue;
    }
    invalidInARow = 0;
    refusedInARow = 0;
    if (parsed.action === "finish") return parsed.answer;
    for (const call of calls) emit({ type: "handoff", from: supervisor.id, to: call.worker, note: call.instruction.slice(0, NOTE_MAX) });
    // The called workers work at the same time. Each result goes back to the supervisor as soon as it is ready.
    const results = await Promise.all(
      calls.map(async (call) => {
        const result = await agents.get(call.worker).run(`Task: ${task}\n\nInstruction from the supervisor:\n${call.instruction}`);
        emit({ type: "handoff", from: call.worker, to: supervisor.id, note: result.text.slice(0, NOTE_MAX) });
        return { worker: call.worker, text: result.text };
      }),
    );
    input = results.map((r) => `Result from ${r.worker}:\n${passOn(r.text, r.worker)}`).join("\n\n");
  }
}
