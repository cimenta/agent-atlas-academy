// Plan-and-execute: a planner writes the steps once, an executor carries them out one after another.
import { parseListReply, LIST_MIN, LIST_MAX } from "./list-reply.js";
import { instanceId } from "../spawn.js";
import { ApprovalPause } from "../approval.js";

const NOTE_MAX = 2000;
const REPAIR = `Reply with valid JSON as instructed: {"steps":["<step 1>","<step 2>"]} with ${LIST_MIN} to ${LIST_MAX} steps, each a non-empty text.`;

export const parseStepsReply = (text) => parseListReply(text, "steps");

// The result is the text of the last step. When a limit or an error ends the run, the text of the last finished step
// goes with the error, so the run can still show how far it got (a pause for approval is not an ending).
export async function run({ design, task, agents, spawn, emit, passOn = (text) => text }) {
  const planner = design.nodes.find((n) => n.agent === "planner");
  const executor = design.nodes.find((n) => n.agent === "executor");
  let last = "";
  try {
    let input = `Task: ${task}`;
    let steps = null;
    for (let tries = 0; tries < 2 && !steps; tries++) {
      steps = parseStepsReply((await agents.get(planner.id).run(input)).text);
      input = REPAIR;
    }
    if (!steps) throw new Error("plan.invalid: the planner did not give a valid list of steps twice in a row");
    const plan = steps.map((step, i) => `${i + 1}. ${step}`).join("\n");
    const done = [];
    for (let i = 0; i < steps.length; i++) {
      const id = instanceId(executor.id, i + 1);
      if (i === 0) emit({ type: "handoff", from: planner.id, to: id, note: plan.slice(0, NOTE_MAX) });
      const so_far = done.length > 0 ? `Results so far:\n${done.map((r) => `--- step ${r.n} ---\n${passOn(r.text, r.id)}`).join("\n\n")}` : null;
      const message = [`Task: ${task}`, `The plan:\n${plan}`, so_far, `Now do step ${i + 1}: ${steps[i]}`].filter(Boolean).join("\n\n");
      const text = (await spawn(executor.id, i + 1).run(message)).text;
      done.push({ n: i + 1, id, text });
      last = text;
      if (i + 1 < steps.length) emit({ type: "handoff", from: id, to: instanceId(executor.id, i + 2), note: text.slice(0, NOTE_MAX) });
    }
    return last;
  } catch (error) {
    if (!(error instanceof ApprovalPause)) error.partialText = last;
    throw error;
  }
}
