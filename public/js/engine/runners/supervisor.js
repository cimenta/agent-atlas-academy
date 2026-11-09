// Supervisor: one supervisor decides which worker works next and when to finish.
const NOTE_MAX = 2000;
const isText = (v) => typeof v === "string" && v.length > 0;

function candidates(text) {
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
    if (data.action === "call" && isText(data.worker)) {
      return { action: "call", worker: data.worker, instruction: typeof data.instruction === "string" ? data.instruction : "" };
    }
    if (data.action === "finish" && typeof data.answer === "string") return { action: "finish", answer: data.answer };
  }
  return null;
}

export async function run({ design, task, agents, emit }) {
  const supervisor = design.nodes.find((n) => n.agent === "supervisor");
  const workerIds = design.nodes.filter((n) => n.agent !== "supervisor").map((n) => n.id);
  const boss = agents.get(supervisor.id);
  let input = `Task: ${task}\nWorkers: ${workerIds.join(", ")}`;
  let invalidInARow = 0;
  for (;;) {
    const reply = await boss.run(input);
    const parsed = parseSupervisorReply(reply.text);
    const usable = parsed && (parsed.action === "finish" || workerIds.includes(parsed.worker));
    if (!usable) {
      invalidInARow += 1;
      if (invalidInARow >= 2) throw new Error("supervisor.invalid: the supervisor did not give a valid instruction twice in a row");
      input = `Reply with valid JSON as instructed. Valid workers: ${workerIds.join(", ")}.`;
      continue;
    }
    invalidInARow = 0;
    if (parsed.action === "finish") return parsed.answer;
    emit({ type: "handoff", from: supervisor.id, to: parsed.worker, note: parsed.instruction.slice(0, NOTE_MAX) });
    const result = await agents.get(parsed.worker).run(`Task: ${task}\n\nInstruction from the supervisor:\n${parsed.instruction}`);
    emit({ type: "handoff", from: parsed.worker, to: supervisor.id, note: result.text.slice(0, NOTE_MAX) });
    input = `Result from ${parsed.worker}:\n${result.text}`;
  }
}
