// Sequential: one chain. Each agent gets the task and the previous agent's output.
import { orderOf } from "../patterns.js";

const NOTE_MAX = 2000;

export async function run({ design, task, agents, emit }) {
  let previous = null;
  for (const id of orderOf(design)) {
    if (previous) emit({ type: "handoff", from: previous.id, to: id, note: previous.text.slice(0, NOTE_MAX) });
    const input = previous
      ? `Task: ${task}\n\nThe previous agent (${previous.id}) wrote:\n${previous.text}`
      : `Task: ${task}`;
    const result = await agents.get(id).run(input);
    previous = { id, text: result.text };
  }
  return previous ? previous.text : "";
}
