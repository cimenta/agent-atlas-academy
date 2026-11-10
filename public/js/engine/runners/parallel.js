// Parallel: every worker gets the task and works at the same time; one combiner writes the answer.
// Agents that follow the combiner (a critic, a writer) then work one after another on that answer.
import { parallelParts } from "../patterns.js";

const NOTE_MAX = 2000;

export async function run({ design, task, agents, emit }) {
  const { hub: combiner, workers, followers } = parallelParts(design.nodes, design.edges);
  const results = await Promise.all(
    workers.map(async (worker) => {
      const result = await agents.get(worker.id).run(`Task: ${task}`);
      return { id: worker.id, text: result.text };
    }),
  );
  for (const result of results) {
    emit({ type: "handoff", from: result.id, to: combiner.id, note: result.text.slice(0, NOTE_MAX) });
  }
  const input = `Task: ${task}\n\nResults from the agents:\n${results.map((r) => `--- ${r.id} ---\n${r.text}`).join("\n\n")}`;
  const merged = await agents.get(combiner.id).run(input);
  let previous = { id: combiner.id, text: merged.text };
  for (const id of followers) {
    emit({ type: "handoff", from: previous.id, to: id, note: previous.text.slice(0, NOTE_MAX) });
    const result = await agents.get(id).run(`Task: ${task}\n\nThe previous agent (${previous.id}) wrote:\n${previous.text}`);
    previous = { id, text: result.text };
  }
  return previous.text;
}
