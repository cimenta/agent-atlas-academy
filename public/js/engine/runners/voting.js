// Voting: every voter answers the task alone, at the same time. One tally agent reads all the answers and names
// the answer most of them agree on, and which voters agree. The tally's answer is the result.
import { candidates } from "./supervisor.js";
import { ApprovalPause } from "../approval.js";
import { votingParts } from "../patterns.js";

const NOTE_MAX = 2000;

// Reads the tally's decision. `voterIds` holds the voter ids. Unknown ids and repeats are dropped.
// Returns null when the reply is not valid (no answer, or no known voter that agrees).
export function parseVotingReply(text, voterIds) {
  if (typeof text !== "string" || text.trim() === "") return null;
  for (const candidate of candidates(text)) {
    let data;
    try {
      data = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (data === null || typeof data !== "object" || Array.isArray(data)) continue;
    if (typeof data.answer !== "string" || data.answer.trim() === "" || !Array.isArray(data.agree)) continue;
    const agree = [...new Set(data.agree.filter((id) => typeof id === "string" && voterIds.includes(id.trim())).map((id) => id.trim()))];
    if (agree.length === 0) continue;
    return { answer: data.answer.trim(), agree, note: typeof data.note === "string" ? data.note.trim() : "" };
  }
  return null;
}

// When a limit or an error ends the run before the tally has decided, the result is empty
// (a pause for approval is not an ending).
export async function run({ design, task, agents, emit, passOn = (text) => text }) {
  const { tally, voters } = votingParts(design.nodes);
  const ids = voters.map((v) => v.id);
  try {
    const answers = await Promise.all(
      voters.map(async (voter) => {
        const result = await agents.get(voter.id).run(`Task: ${task}`);
        return { id: voter.id, text: result.text };
      }),
    );
    for (const answer of answers) emit({ type: "handoff", from: answer.id, to: tally.id, note: answer.text.slice(0, NOTE_MAX) });
    let input = `Task: ${task}\n\nAnswers of the voters:\n${answers.map((a) => `--- ${a.id} ---\n${passOn(a.text, a.id)}`).join("\n\n")}`;
    let decision = null;
    for (let tries = 0; tries < 2 && !decision; tries++) {
      decision = parseVotingReply((await agents.get(tally.id).run(input)).text, ids);
      input = `Reply with valid JSON as instructed. The voters are: ${ids.join(", ")}. The list agree must name at least one of them.`;
    }
    if (!decision) throw new Error("vote.invalid: the tally did not give a valid decision twice in a row");
    return decision.answer;
  } catch (error) {
    if (!(error instanceof ApprovalPause)) error.partialText = "";
    throw error;
  }
}
