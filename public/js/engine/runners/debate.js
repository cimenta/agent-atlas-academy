// Debate: debaters answer in turns for a number of rounds, then one judge decides.
import { agentLabel } from "../labels.js";

const NOTE_MAX = 2000;

const transcriptText = (turns) => (turns.length === 0 ? "(nothing yet)" : turns.map((t) => `${t.id}: ${t.text}`).join("\n\n"));

export async function run({ design, task, agents, emit }) {
  const debaters = design.nodes.filter((n) => n.agent === "debater");
  const judge = design.nodes.find((n) => n.agent === "judge");
  const turns = [];
  for (let round = 1; round <= design.rounds; round++) {
    for (const debater of debaters) {
      const input = `Task: ${task}\n\nThe debate so far:\n${transcriptText(turns)}\n\nGive your argument now.`;
      const result = await agents.get(debater.id).run(input);
      turns.push({ id: agentLabel(debater, design, "Debater"), text: result.text });
      emit({ type: "handoff", from: debater.id, to: judge.id, note: result.text.slice(0, NOTE_MAX) });
    }
  }
  const verdict = await agents.get(judge.id).run(`Task: ${task}\n\nThe whole debate:\n${transcriptText(turns)}\n\nGive your verdict now.`);
  return verdict.text;
}
