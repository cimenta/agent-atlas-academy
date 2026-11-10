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
    // A critic can add its notes to what the agent before it wrote, so the next agent gets both.
    const adds = previous && design.nodes.find((n) => n.id === id)?.addToPrevious === true;
    previous = { id, text: adds ? `${previous.text}\n\n--- ${id} ---\n${result.text}` : result.text };
  }
  return previous ? previous.text : "";
}
