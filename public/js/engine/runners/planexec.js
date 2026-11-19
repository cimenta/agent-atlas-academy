// Plan-and-execute: a planner writes the steps once, an executor carries them out one after another.
import { parseListReply, LIST_MIN, LIST_MAX } from "./list-reply.js";
import { candidates } from "./supervisor.js";
import { CREATE_MAX } from "../catalog.js";
import { instanceId } from "../spawn.js";
import { ApprovalPause } from "../approval.js";

const NOTE_MAX = 2000;
const REPAIR = `Reply with valid JSON as instructed: {"steps":["<step 1>","<step 2>"]} with ${LIST_MIN} to ${LIST_MAX} steps, each a non-empty text.`;

export const parseStepsReply = (text) => parseListReply(text, "steps");

const isText = (v) => typeof v === "string" && v.trim() !== "";

// The reply of a planner that may create agents: {"agents":[{"name","instructions"}],"steps":["text" | {"text","agent"}]}.
// Gives { steps: [{ text, agent }], agents: [{ name, instructions }] } (agent is the name of a created agent, or null),
// or null when the reply is not valid. A step may only name an agent that the same reply creates.
export function parsePlanReply(text) {
  if (typeof text !== "string" || text.trim() === "") return null;
  for (const candidate of candidates(text)) {
    let data;
    try {
      data = JSON.parse(candidate.trim());
    } catch {
      continue;
    }
    if (data === null || typeof data !== "object" || Array.isArray(data) || !Array.isArray(data.steps)) continue;
    const agents = data.agents === undefined ? [] : data.agents;
    if (!Array.isArray(agents) || agents.length > CREATE_MAX || !agents.every((a) => a && typeof a === "object" && isText(a.name) && isText(a.instructions))) continue;
    if (data.steps.length < LIST_MIN || data.steps.length > LIST_MAX) continue;
    const byName = new Map(agents.map((a) => [a.name.trim().toLowerCase(), a.name.trim()]));
    const steps = [];
    let good = true;
    for (const step of data.steps) {
      if (typeof step === "string" && isText(step)) steps.push({ text: step.trim(), agent: null });
      else if (step && typeof step === "object" && isText(step.text) && (step.agent === undefined || step.agent === null || (isText(step.agent) && byName.has(step.agent.trim().toLowerCase())))) {
        steps.push({ text: step.text.trim(), agent: isText(step.agent) ? byName.get(step.agent.trim().toLowerCase()) : null });
      } else good = false;
    }
    if (good) return { steps, agents: agents.map((a) => ({ name: a.name.trim(), instructions: a.instructions.trim() })) };
  }
  return null;
}

// Why a request to create an agent was refused, as the planner is told it.
const REFUSED = {
  "not-allowed": "you may not create agents",
  cap: "you have already created all the agents you may create",
  total: "the run has no room for another agent",
  name: "the name must be 1 to 40 characters",
  "name-taken": "an agent with that name exists already",
  instructions: "the instructions must be text of 1 to 2000 characters",
};

// The result is the text of the last step. When a limit or an error ends the run, the text of the last finished step
// goes with the error, so the run can still show how far it got (a pause for approval is not an ending).
export async function run({ design, task, agents, spawn, emit, passOn = (text) => text, create = null }) {
  const planner = design.nodes.find((n) => n.agent === "planner");
  const executor = design.nodes.find((n) => n.agent === "executor");
  let last = "";
  try {
    let input = `Task: ${task}`;
    let steps = null;
    // The agents this planner made, by lower-case name: a repeated try keeps the ones that were already made.
    const made = new Map();
    let lastRefused = null;
    const canCreate = create !== null && planner.creates !== undefined;
    for (let tries = 0; tries < 2 && !steps; tries++) {
      const parsed = parsePlanReply((await agents.get(planner.id).run(input)).text);
      input = REPAIR;
      if (!parsed || (parsed.agents.length > 0 && !canCreate)) continue;
      let refused = null;
      for (const wanted of parsed.agents) {
        const key = wanted.name.toLowerCase();
        if (made.has(key)) continue;
        const result = create({ by: planner.id, name: wanted.name, instructions: wanted.instructions });
        if (!result.ok) {
          refused = REFUSED[result.reason] ?? result.reason;
          break;
        }
        made.set(key, result.id);
      }
      if (refused) {
        lastRefused = refused;
        input = `Creating refused: ${refused}. ${REPAIR}`;
        continue;
      }
      steps = parsed.steps.map((step) => ({ text: step.text, who: step.agent ? made.get(step.agent.toLowerCase()) : null }));
    }
    if (!steps && lastRefused) throw new Error(`plan.refused: the planner asked to create an agent that was refused (${lastRefused})`);
    if (!steps) throw new Error("plan.invalid: the planner did not give a valid list of steps twice in a row");
    const plan = steps.map((step, i) => `${i + 1}. ${step.text}`).join("\n");
    const idOf = (i) => steps[i].who ?? instanceId(executor.id, i + 1);
    const agentOf = (i) => (steps[i].who ? agents.get(steps[i].who) : spawn(executor.id, i + 1));
    const done = [];
    for (let i = 0; i < steps.length; i++) {
      const id = idOf(i);
      if (i === 0) emit({ type: "handoff", from: planner.id, to: id, note: plan.slice(0, NOTE_MAX) });
      const so_far = done.length > 0 ? `Results so far:\n${done.map((r) => `--- step ${r.n} ---\n${passOn(r.text, r.id)}`).join("\n\n")}` : null;
      const message = [`Task: ${task}`, `The plan:\n${plan}`, so_far, `Now do step ${i + 1}: ${steps[i].text}`].filter(Boolean).join("\n\n");
      const text = (await agentOf(i).run(message)).text;
      done.push({ n: i + 1, id, text });
      last = text;
      if (i + 1 < steps.length) emit({ type: "handoff", from: id, to: idOf(i + 1), note: text.slice(0, NOTE_MAX) });
    }
    return last;
  } catch (error) {
    if (!(error instanceof ApprovalPause)) error.partialText = last;
    throw error;
  }
}
