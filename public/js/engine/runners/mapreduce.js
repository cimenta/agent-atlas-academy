// Map-reduce: a splitter cuts the task into parts, a worker runs once for every part at the same time, a reducer merges.
import { parseListReply, LIST_MIN, LIST_MAX } from "./list-reply.js";
import { instanceId } from "../spawn.js";

const NOTE_MAX = 2000;
const REPAIR = `Reply with valid JSON as instructed: {"parts":["<part 1>","<part 2>"]} with ${LIST_MIN} to ${LIST_MAX} parts, each a non-empty text.`;

export const parsePartsReply = (text) => parseListReply(text, "parts");

export async function run({ design, task, agents, spawn, emit, passOn = (text) => text }) {
  const splitter = design.nodes.find((n) => n.agent === "splitter");
  const worker = design.nodes.find((n) => n.agent === "worker");
  const reducer = design.nodes.find((n) => n.agent === "reducer");
  let input = `Task: ${task}`;
  let parts = null;
  for (let tries = 0; tries < 2 && !parts; tries++) {
    parts = parsePartsReply((await agents.get(splitter.id).run(input)).text);
    input = REPAIR;
  }
  if (!parts) throw new Error("map.invalid: the splitter did not give a valid list of parts twice in a row");
  const ids = parts.map((_, i) => instanceId(worker.id, i + 1));
  parts.forEach((part, i) => emit({ type: "handoff", from: splitter.id, to: ids[i], note: part.slice(0, NOTE_MAX) }));
  // The workers work at the same time; each gets the task and its own part, and sees no other part.
  const results = await Promise.all(parts.map(async (part, i) => ({ id: ids[i], text: (await spawn(worker.id, i + 1).run(`Task: ${task}\n\nYour part:\n${part}`)).text })));
  for (const result of results) emit({ type: "handoff", from: result.id, to: reducer.id, note: result.text.slice(0, NOTE_MAX) });
  const merged = `Task: ${task}\n\nResults of the workers:\n${results.map((r) => `--- ${r.id} ---\n${passOn(r.text, r.id)}`).join("\n\n")}`;
  return (await agents.get(reducer.id).run(merged)).text;
}
