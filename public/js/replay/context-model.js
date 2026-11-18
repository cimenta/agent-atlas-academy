// What each agent had in front of it on every model call, and a few numbers about the whole run.
// Everything is read from the events that are recorded, so it also works on old recordings.
import { deriveInspector } from "./inspect-model.js";
import { buildStatistics } from "../play-model.js";

const NOTEBOOK_MARK = "\n\nNotebook:\n";

// The length of the text in a message: a string, or the text blocks of a content list. Anything else counts as nothing.
function lengthOf(content) {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const block of content) {
    if (typeof block === "string") n += block.length;
    else if (block && typeof block.text === "string") n += block.text.length;
    else if (block && typeof block.content === "string") n += block.content.length;
    else if (block && (block.type === "tool_use" || block.type === "server_tool_use")) n += JSON.stringify(block.input ?? {}).length;
    else if (block && block.type === "web_search_tool_result") n += JSON.stringify(block.content ?? "").length;
  }
  return n;
}

// The first user message is the task, then what other agents passed on, then (when the notebook is on) the notebook.
function splitFirst(text, task, notebookOn) {
  const parts = { task: 0, others: 0, notebook: 0 };
  let rest = text;
  const book = notebookOn ? rest.lastIndexOf(NOTEBOOK_MARK) : -1;
  if (book !== -1) {
    parts.notebook = rest.length - book;
    rest = rest.slice(0, book);
  }
  if (rest.startsWith("Task:")) {
    const own = `Task: ${task}`;
    const cut = task && rest.startsWith(own) ? own.length : (rest.indexOf("\n\n") === -1 ? rest.length : rest.indexOf("\n\n"));
    parts.task = cut;
    parts.others = rest.length - cut;
  } else {
    parts.others = rest.length;
  }
  return parts;
}

// One row for each model call of the agent that the player has reached: the input tokens the provider counted, and the
// characters of what the call was made of. The tokens are exact; the parts are shares of characters.
export function contextOf(events, agentId, cursor = events.length) {
  const state = deriveInspector(events, cursor);
  const agent = state.agents[agentId];
  if (!agent) return [];
  // The notebook block is only told apart when the run has the notebook on: any other text may contain the same words.
  const notebookOn = events.find((e) => e?.type === "run_start")?.design?.memory?.notebook === true;
  return agent.rounds
    .filter((round) => !round.reconstructed)
    .map((round) => {
      const parts = { system: typeof agent.system === "string" ? agent.system.length : 0, task: 0, others: 0, notebook: 0, own: 0 };
      let first = true;
      for (const message of round.messages) {
        if (!message || typeof message !== "object") continue;
        if (message.role === "assistant") {
          parts.own += lengthOf(message.content);
        } else if (first && typeof message.content === "string") {
          const split = splitFirst(message.content, state.task, notebookOn);
          parts.task += split.task;
          parts.others += split.others;
          parts.notebook += split.notebook;
          first = false;
        } else if (notebookOn && message.role === "user" && typeof message.content === "string" && message.content.lastIndexOf(NOTEBOOK_MARK) !== -1) {
          const at = message.content.lastIndexOf(NOTEBOOK_MARK);
          parts.notebook += message.content.length - at;
          parts.others += at;
          first = false;
        } else {
          parts.others += lengthOf(message.content);
          if (message.role === "user") first = false;
        }
      }
      return { round: round.n, input: Number(round.usage?.input) || 0, parts };
    });
}

// The numbers of one run in one place: what Statistics shows today, and what a later comparison of two runs will use.
// `run` is a recording ({ events, ... }).
export function runMetrics(run) {
  const events = Array.isArray(run?.events) ? run.events : [];
  const stats = buildStatistics(run);
  let largest = 0;
  let notes = 0;
  let saved = 0;
  let condensed = 0;
  for (const event of events) {
    if (event?.type === "round") largest = Math.max(largest, Number(event.usage?.input) || 0);
    else if (event?.type === "note") notes += 1;
    else if (event?.type === "condense") {
      condensed += 1;
      if (event.kept !== false) saved += Math.max(0, (Number(event.from) || 0) - (Number(event.to) || 0));
    }
  }
  return { steps: stats.calls + condensed, input: stats.usage.input, output: stats.usage.output, cost: stats.cost, ms: stats.totalMs, largest, notes, saved, outcome: stats.status };
}

// The input tokens of every model call of the run, in the order the calls happened, with the label of the agent.
export function contextPerCall(events) {
  const list = Array.isArray(events) ? events : [];
  const labels = deriveInspector(list).agents;
  return list
    .filter((e) => e?.type === "round" && typeof e.agent === "string")
    .map((e) => ({ agent: e.agent, label: labels[e.agent]?.label || e.agent, round: Number(e.round) || 1, input: Number(e.usage?.input) || 0 }));
}
