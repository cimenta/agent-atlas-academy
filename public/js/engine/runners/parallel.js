// Parallel: every worker gets the task and works at the same time; one combiner writes the answer.
const NOTE_MAX = 2000;

export async function run({ design, task, agents, emit }) {
  const combiner = design.nodes.find((n) => n.agent === "combiner");
  const workers = design.nodes.filter((n) => n.agent !== "combiner");
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
  const final = await agents.get(combiner.id).run(input);
  return final.text;
}
