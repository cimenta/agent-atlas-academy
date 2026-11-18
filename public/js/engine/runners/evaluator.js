// Evaluator loop: a writer drafts, an evaluator accepts or asks for a revision, until accepted or out of rounds.
import { candidates } from "./supervisor.js";
import { LimitError } from "../budget.js";
import { ApprovalPause } from "../approval.js";

// Reads the evaluator's reply. Returns null when it is not a valid verdict.
export function parseVerdict(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  for (const candidate of candidates(text)) {
    let data;
    try {
      data = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (data === null || typeof data !== "object" || Array.isArray(data) || typeof data.verdict !== "string") continue;
    const word = data.verdict.trim().toLowerCase();
    if (word === "accept") return { verdict: "accept" };
    if (word === "revise" && typeof data.feedback === "string" && data.feedback.trim() !== "") return { verdict: "revise", feedback: data.feedback.trim() };
  }
  return null;
}

const NOTE_MAX = 2000;
const REPAIR = 'Reply with valid JSON as instructed: {"verdict":"accept"} or {"verdict":"revise","feedback":"..."}.';

// The writer drafts, the evaluator judges it against the criteria. The run ends when the draft is accepted, when the
// rounds run out (the last draft is the result, marked not accepted) or when a limit of the harness stops it
// (the last draft goes with the error, so the run can still show it).
export async function run({ design, task, agents, emit, passOn = (text) => text }) {
  const writer = design.nodes.find((n) => n.agent === "writer");
  // Self-critique: the writer judges its own draft, with a second call that has the evaluator role.
  const self = design.selfCritique === true;
  const evaluator = self ? writer : design.nodes.find((n) => n.agent === "evaluator");
  const judge = (input) => (self ? agents.get(writer.id).run(input, { as: "evaluator" }) : agents.get(evaluator.id).run(input));
  let judging = false; // self-critique: is the agent in its judging call?
  const criteria = typeof design.criteria === "string" && design.criteria.trim() !== "" ? design.criteria.trim() : "(none given)";
  let draft = "";
  let drafts = 0;
  let judged = false; // is the last draft judged? (no draft yet: nothing is judged)
  let feedback = "";
  try {
    for (let round = 1; round <= design.rounds; round++) {
      const writerInput =
        round === 1
          ? `Task: ${task}`
          : `Task: ${task}\n\nYour last draft:\n${passOn(draft, writer.id)}\n\n${self ? "Your own feedback on it" : "The evaluator's feedback"}:\n${passOn(feedback, evaluator.id)}\n\nWrite the improved draft now.`;
      judging = false;
      draft = (await agents.get(writer.id).run(writerInput)).text;
      drafts = round;
      judged = false;
      if (!self) emit({ type: "handoff", from: writer.id, to: evaluator.id, note: draft.slice(0, NOTE_MAX) });
      let input = `Task: ${task}\n\nCriteria:\n${criteria}\n\nDraft:\n${passOn(draft, writer.id)}\n\nGive your verdict now.`;
      let verdict = null;
      judging = true;
      for (let tries = 0; tries < 2 && !verdict; tries++) {
        verdict = parseVerdict((await judge(input)).text);
        input = REPAIR;
      }
      if (!verdict) throw new Error("evaluator.invalid: the evaluator did not give a valid verdict twice in a row");
      judged = true;
      if (verdict.verdict === "accept") {
        emit({ type: "loop_end", result: "accepted", round, judged: true });
        return draft;
      }
      feedback = verdict.feedback;
      // The writer gets the feedback only when there is a next round.
      if (round < design.rounds && !self) emit({ type: "handoff", from: evaluator.id, to: writer.id, note: feedback.slice(0, NOTE_MAX) });
    }
  } catch (error) {
    if (error instanceof LimitError) {
      // A limit of the evaluator that comes after its answer (repeated answers, its tokens) still leaves a verdict in the replay.
      const afterVerdict = error.agent === evaluator.id && (!self || judging) && (error.reason === "repeat" || error.reason === "agent_tokens");
      emit({ type: "loop_end", result: "stopped", round: Math.max(1, drafts), judged: drafts > 0 && (judged || afterVerdict) });
    }
    // Whatever ends the run, the last draft is its result; a pause for approval is not an ending.
    if (!(error instanceof ApprovalPause)) error.partialText = draft;
    throw error;
  }
  emit({ type: "loop_end", result: "not_accepted", round: design.rounds, judged: true });
  return draft;
}
