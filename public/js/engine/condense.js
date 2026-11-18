// Condensing: the answers of earlier agents are shortened by one extra model call before an agent that asks for it reads them.
// The task itself is never shortened, and a short text is passed on as it is.
export const CONDENSE_MIN = 1500; // the material must be longer than this many characters
export const CONDENSE_WORDS = 150; // the summary is at most this many words
export const CONDENSE_TAIL_MAX = 120; // a closing one-line instruction up to this long stays outside the material
export const CONDENSE_HEADING = "Summary of what the earlier agents wrote (shortened):";
const DECISION_AGENTS = new Set(["supervisor", "evaluator", "router", "tally"]);
// A worker and an executor get their instruction (a part, a step of the plan) in the input, so it must not be summarised.
const INSTRUCTION_AGENTS = new Set(["worker", "executor"]);
// Inputs that are not material for a summary: an instruction the program gives, and the draft a writer revises.
const NOT_MATERIAL = ["Instruction from the supervisor:", "Your last draft:"];
// Patterns in which no agent condenses: a handoff agent and an evaluator loop need the text exactly as it is.
const NO_CONDENSE_PATTERNS = new Set(["handoff", "evaluator"]);

// May an agent of this type, in this pattern, receive a condensed input? Not one whose reply the program reads as a decision:
// it must see everything it judges.
export function mayCondense(agent, pattern) {
  return !DECISION_AGENTS.has(agent) && !INSTRUCTION_AGENTS.has(agent) && !NO_CONDENSE_PATTERNS.has(pattern);
}

// An input is the task, a blank line and the material (what other agents passed on), sometimes a one-line instruction at the end.
// Returns { head, material, tail } when it begins with `Task: <task>` and the material is longer than CONDENSE_MIN characters;
// null for any other input.
export function splitInput(input, task) {
  if (typeof input !== "string" || typeof task !== "string") return null;
  const start = `Task: ${task}`;
  if (!input.startsWith(start)) return null;
  const rest = input.slice(start.length);
  if (!rest.startsWith("\n\n")) return null;
  let material = rest.slice(2);
  if (NOT_MATERIAL.some((mark) => material.startsWith(mark))) return null;
  let tail = "";
  const cut = material.lastIndexOf("\n\n");
  if (cut !== -1) {
    const last = material.slice(cut + 2);
    if (!last.includes("\n") && last.length <= CONDENSE_TAIL_MAX) {
      tail = last;
      material = material.slice(0, cut);
    }
  }
  if (material.length <= CONDENSE_MIN) return null;
  return { head: `${start}\n\n`, material, tail };
}

// The fixed instruction of the extra call.
export function condenseInstruction(language = "en") {
  return `You shorten text for another agent. Keep the facts, names, numbers and decisions. Drop repetition and detail that is not needed. Write at most ${CONDENSE_WORDS} words, in plain text, without comments of your own. Answer in ${language === "cs" ? "Czech" : "English"}.`;
}

// The input the agent gets in place of the long one.
export function condensedInput(head, summary, tail = "") {
  return `${head}${CONDENSE_HEADING}\n${summary}${tail === "" ? "" : `\n\n${tail}`}`;
}
