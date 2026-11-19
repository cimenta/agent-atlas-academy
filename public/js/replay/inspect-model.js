import { agentLabel, numberRepeatedLabels } from "../engine/labels.js";
import { AGENT_TYPES } from "../engine/catalog.js";
import { warningHelp } from "../help-ids.js";
import { parseVotingReply } from "../engine/runners/voting.js";
import { parseStepsReply } from "../engine/runners/planexec.js";
import { MULTI_RUN } from "../engine/spawn.js";
import { designWithCreated } from "../engine/created.js";
// Turns a run's events into what the inspector shows: one entry per agent, with its steps
// (model calls, tool calls, handoffs), the messages of each model round and its output.
// Pure: no DOM.

const SUMMARY_LENGTH = 600;

function agentIds(events) {
  const seen = [];
  const add = (id) => {
    if (typeof id === "string" && id && !seen.includes(id)) seen.push(id);
  };
  for (const e of events) {
    if (e.type === "agent_start") add(e.agent);
    if (e.type === "handoff") {
      add(e.from);
      add(e.to);
    }
  }
  // In a debate the judge comes in after the first debater's turn, but it speaks last: keep it at the end of the row.
  const design = events.find((e) => e.type === "run_start")?.design;
  if (design?.pattern === "debate") {
    const judges = new Set((design.nodes ?? []).filter((n) => n.agent === "judge").map((n) => n.id));
    return [...seen.filter((id) => !judges.has(id)), ...seen.filter((id) => judges.has(id))];
  }
  return seen;
}

function replySummary(content, stop) {
  const text = (content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(" ");
  const cut = text.length > SUMMARY_LENGTH;
  const shown = cut ? `${text.slice(0, SUMMARY_LENGTH)}…` : text;
  return { text: `stop_reason: ${stop ?? "?"}${shown ? `\n${shown}` : ""}`, cut };
}

function emptyAgent(id) {
  return { id, label: id, status: "waiting", steps: [], rounds: [], model: "", tools: [], system: "", output: null, ms: null, startT: null, from: null, usage: null };
}

// The name each agent is shown with, known from the start of the run so it does not change when the agent
// becomes active. A run that recorded its design uses it; an older run uses the roles its agents started
// with, and an agent that was never started keeps its id.
// The label of an agent of a design, also one that has not started (and so is not in the inspector yet).
export function designLabel(design, id) {
  const node = Array.isArray(design?.nodes) ? design.nodes.find((n) => n.id === id) : null;
  return node ? agentLabel(node, design, AGENT_TYPES[node.agent]?.label ?? node.agent) : id;
}

function labelsFor(events, order) {
  const design = designWithCreated(events.find((e) => e.type === "run_start")?.design, events);
  const labels = new Map();
  if (Array.isArray(design?.nodes)) {
    for (const node of design.nodes) labels.set(node.id, agentLabel(node, design, AGENT_TYPES[node.agent]?.label ?? node.agent));
  }
  const missing = order.filter((id) => !labels.has(id));
  const roles = missing.map((id) => {
    const start = events.find((e) => e.type === "agent_start" && e.agent === id && typeof e.role === "string" && e.role);
    return start ? start.role : id;
  });
  const numbered = numberRepeatedLabels(roles);
  missing.forEach((id, i) => labels.set(id, numbered[i]));
  return labels;
}

export function deriveInspector(events, cursor = events.length) {
  const applied = events.slice(0, Math.max(0, Math.min(events.length, cursor)));
  const agents = {};
  const order = agentIds(events);
  for (const id of order) agents[id] = emptyAgent(id);
  const state = { task: "", order, agents, warnings: [], warningTimes: [], warningHelps: [], error: null, finished: false, outcome: null, reason: null, tokens: { input: 0, output: 0 } };

  applied.forEach((event, index) => {
    const agent = typeof event.agent === "string" ? agents[event.agent] : null;
    switch (event.type) {
      case "run_start":
        state.task = typeof event.task === "string" ? event.task : "";
        break;
      case "agent_start":
        if (!agent) break;
        agent.status = "working";
        agent.startT = event.t ?? 0;
        agent.firstIndex = index;
        if (typeof event.model === "string") agent.model = event.model;
        if (Array.isArray(event.tools)) agent.tools = event.tools;
        if (typeof event.system === "string") agent.system = event.system;
        break;
      case "round": {
        if (!agent) break;
        const previous = agent.rounds.at(-1);
        const messages = (previous ? previous.messages : []).concat(event.newMessages ?? []);
        agent.rounds.push({
          n: event.round ?? agent.rounds.length + 1,
          messages,
          before: previous ? previous.messages.length : 0,
          response: event.content ?? [],
          stop: event.stop,
          usage: event.usage ?? null,
          ms: event.ms ?? null,
        });
        const summary = replySummary(event.content, event.stop);
        agent.steps.push({
          kind: "model",
          tool: "model",
          at: event.t,
          stop: event.stop,
          text: (event.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("\n\n"),
          messageCount: messages.length,
          title: { key: "insp.modelCall", params: { n: event.round ?? agent.rounds.length } },
          ms: event.ms ?? null,
          input: { key: "insp.msgsCount", params: { n: messages.length } },
          output: summary.text,
          outCut: summary.cut,
          eventIndex: index,
        });
        break;
      }
      case "tool_call":
        if (!agent) break;
        agent.steps.push({
          kind: "tool",
          tool: event.tool,
          at: event.t,
          title: `${event.tool}: ${typeof event.input === "string" ? event.input : JSON.stringify(event.input ?? "")}`,
          ms: null,
          server: true,
          input: typeof event.input === "string" ? event.input : JSON.stringify(event.input ?? {}, null, 2),
          output: null,
          eventIndex: index,
        });
        break;
      case "tool_result": {
        if (!agent) break;
        const output = typeof event.output === "string" ? event.output : (event.text ?? "");
        const open = agent.steps.find((s) => s.kind === "tool" && s.tool === event.tool && s.output === null);
        if (open) {
          open.output = output;
          open.at = event.t;
        } else agent.steps.push({ kind: "tool", at: event.t, tool: event.tool, title: String(event.tool), ms: null, server: true, input: "", output, eventIndex: index });
        break;
      }
      case "handoff": {
        const from = agents[event.from];
        if (from) {
          from.steps.push({
            kind: "handoff",
            tool: "handoff",
            at: event.t,
            from: event.from,
            to: event.to,
            title: { key: "insp.handoffTo", params: { name: event.to } },
            ms: null,
            input: { key: "insp.handoffIn", params: { name: event.from } },
            output: typeof event.note === "string" && event.note ? event.note : (from.output ?? ""),
            eventIndex: index,
          });
        }
        if (agents[event.to]) {
          agents[event.to].from = event.from;
          agents[event.to].inputText = typeof event.note === "string" && event.note ? event.note : (from?.output ?? "");
        }
        break;
      }
      case "agent_created": {
        const by = agents[event.by];
        if (by) {
          by.steps.push({
            kind: "handoff",
            tool: "handoff",
            created: true,
            at: event.t,
            from: event.by,
            to: event.agent,
            title: { key: "insp.createdTitle", params: { name: event.node?.name ?? event.agent } },
            ms: null,
            input: { key: "insp.createdIn", params: { name: event.by } },
            output: typeof event.node?.instructions === "string" ? event.node.instructions : "",
            eventIndex: index,
          });
        }
        break;
      }
      case "agent_refused": {
        const by = agents[event.by];
        if (by) {
          by.steps.push({
            kind: "handoff",
            tool: "handoff",
            refused: true,
            at: event.t,
            from: event.by,
            to: event.by,
            title: { key: `insp.refused.${event.reason}` },
            ms: null,
            input: { key: "insp.createdIn", params: { name: event.by } },
            output: "",
            eventIndex: index,
          });
        }
        break;
      }
      case "handoff_refused": {
        // The agent tried to hand over to an agent it has no arrow to: the rule of the diagram held.
        const from = agents[event.from];
        if (from) {
          from.steps.push({
            kind: "handoff",
            tool: "handoff",
            refused: true,
            at: event.t,
            from: event.from,
            to: event.to,
            title: { key: "insp.handoffRefused", params: { name: event.to } },
            ms: null,
            input: { key: `insp.handoffRefused.${event.reason}`, params: { name: event.to } },
            output: "",
            eventIndex: index,
          });
        }
        break;
      }
      case "format_check": {
        // The harness checked the answer of an agent with an answer format against it (agent.output is the answer that was checked).
        if (agent) {
          const problems = (event.problems ?? []).join("; ");
          const step = (extra) => agent.steps.push({ kind: "check", tool: "format", ok: event.ok === true, attempt: event.attempt, at: event.t, ms: null, eventIndex: index, ...extra });
          if (event.ok === true) {
            const n = Number(event.fields) || 0;
            step({ title: { key: event.attempt === 2 ? "insp.formatOkRepaired" : "insp.formatOk", params: { n } }, input: "", output: agent.output ?? "" });
          } else {
            step({ title: { key: "insp.formatFailed", params: { attempt: event.attempt, problems } }, input: problems, output: agent.output ?? "" });
            // The first failure sends the repair message; the second ends the agent (the error event follows).
            if (event.attempt === 1) step({ ok: true, title: { key: "insp.formatRepairAsked", params: {} }, input: "", output: "" });
            else agent.status = "error";
          }
        }
        break;
      }
      case "guardrail_check": {
        // A guardrail of an agent checked what it received or what it answered. event.text is the text that was checked.
        if (agent) {
          const titleKey = { passed: "insp.guardrailPassed", noted: "insp.guardrailNoted", repair: "insp.guardrailRepair", stopped: "insp.guardrailStopped" }[event.action];
          const params = { n: event.guardrail, kind: { key: `insp.guardrail.kind.${event.kind}` }, where: { key: `insp.guardrail.where.${event.where}` } };
          agent.steps.push({
            kind: "check",
            tool: "guardrail",
            ok: event.ok === true,
            action: event.action,
            attempt: event.attempt,
            at: event.t,
            ms: null,
            eventIndex: index,
            title: { key: titleKey ?? "insp.guardrailPassed", params },
            input: event.reason ?? "",
            output: typeof event.text === "string" ? event.text : "",
            ...(event.tokens ? { reviewer: { tokens: event.tokens, cost: event.cost ?? 0, model: event.model ?? "" } } : {}),
          });
          // A repair sends the agent a message; a stop ends the agent (the error event follows).
          // One message asks for the repair, however many guardrails failed: the step follows the last failing one.
          const next = applied.slice(index + 1).find((e) => e.type === "guardrail_check" && e.agent === event.agent);
          if (event.action === "repair" && !(next && next.action === "repair" && next.attempt === event.attempt)) agent.steps.push({ kind: "check", tool: "guardrail", ok: true, at: event.t, ms: null, eventIndex: index, title: { key: "insp.guardrailRepairAsked", params: {} }, input: "", output: "" });
          if (event.action === "stopped") agent.status = "error";
        }
        break;
      }
      case "approved":
        // You approved this agent: the run waited for your click before it ran.
        if (agent) agent.steps.push({ kind: "approval", tool: "approval", at: event.t, title: { key: "insp.approved", params: {} }, ms: null, input: "", output: { key: "insp.approvedOut", params: {} }, eventIndex: index });
        break;
      case "title":
        if (agent) agent.steps.push({ kind: "title", tool: "title", at: event.t, title: { key: "insp.title", params: {} }, ms: null, input: "", output: typeof event.text === "string" ? event.text : "", eventIndex: index });
        break;
      case "agent_output":
        if (!agent) break;
        agent.status = "done";
        agent.endT = event.t;
        agent.output = typeof event.text === "string" ? event.text : "";
        agent.ms = agent.startT !== null && typeof event.t === "number" ? Math.max(0, event.t - agent.startT) : null;
        agent.usage = event.tokens ?? null;
        state.tokens.input += Number(event.tokens?.input) || 0;
        state.tokens.output += Number(event.tokens?.output) || 0;
        break;
      case "warning":
        state.warnings.push(`${agent ? `${agent.label}: ` : ""}${event.message ?? ""}`);
        state.warningHelps.push(warningHelp(event));
        state.warningTimes.push(typeof event.at === "number" ? event.at : null); // when it happened (clock time), if the run recorded it
        break;
      case "done":
        state.finished = true;
        state.outcome = typeof event.outcome === "string" ? event.outcome : null;
        state.reason = typeof event.reason === "string" ? event.reason : null;
        // An agent that was working when a limit or you stopped the run is stopped, not still working.
        if (state.outcome === "stopped_limit" || state.outcome === "stopped_user") {
          for (const a of Object.values(agents)) {
            if (a.status !== "working") continue;
            a.status = "stopped";
            a.stopReason = state.outcome === "stopped_user" ? "user" : (state.reason ?? "limit");
          }
        }
        break;
      case "error":
        state.error = typeof event.message === "string" ? event.message : "error";
        for (const a of Object.values(agents)) if (a.status === "working") a.status = "error";
        break;
      default:
        break;
    }
  });
  const labels = labelsFor(events, order);
  order.forEach((id) => {
    agents[id].label = labels.get(id);
  });
  for (const agent of Object.values(state.agents)) reconstruct(agent, state.task);
  return state;
}

// Runs recorded before model rounds were kept have no rounds. Rebuild one from what is there:
// the input the agent got, its tool calls and its answer, so every started agent can be inspected.
function reconstruct(agent, task) {
  if (agent.startT === null) return;
  if (agent.tools.length === 0) agent.tools = [...new Set(agent.steps.filter((s) => s.kind === "tool").map((s) => s.tool))];
  if (agent.rounds.length > 0) return;
  const input = agent.from ? (agent.inputText ?? "") : task;
  const used = [];
  for (const step of agent.steps.filter((x) => x.kind === "tool")) {
    used.push({ type: "server_tool_use", name: step.tool, input: step.input });
    if (step.output !== null) used.push({ type: "web_search_tool_result", content: step.output });
  }
  const response = [...used, ...(agent.output ? [{ type: "text", text: agent.output }] : [])];
  agent.rounds.push({
    n: 1,
    messages: input ? [{ role: "user", content: input }] : [],
    before: 0,
    response,
    stop: agent.output === null ? undefined : "end_turn",
    usage: agent.usage ? { input: agent.usage.input, output: agent.usage.output } : null,
    ms: agent.ms,
    reconstructed: true,
  });
  const summary = replySummary(response.filter((b) => b.type === "text"), agent.output === null ? undefined : "end_turn");
  agent.steps.unshift({
    kind: "model",
    tool: "model",
    at: agent.endT,
    stop: agent.output === null ? undefined : "end_turn",
    text: agent.output ?? "",
    messageCount: input ? 1 : 0,
    title: { key: "insp.modelCall", params: { n: 1 } },
    ms: agent.ms,
    input: { key: "insp.msgsCount", params: { n: input ? 1 : 0 } },
    output: agent.output === null ? null : summary.text,
    outCut: summary.cut,
    eventIndex: agent.firstIndex ?? 0,
  });
}

// Where a debate stands at the cursor: which round the debaters are in, or that the judge is speaking.
// Null for runs that are not debates. Each debater turn starts with an agent_start event.
export function debateProgress(events, cursor) {
  const design = events.find((e) => e.type === "run_start")?.design;
  if (design?.pattern !== "debate" || !Number.isInteger(design.rounds)) return null;
  const debaters = new Set(design.nodes.filter((n) => n.agent === "debater").map((n) => n.id));
  const judges = new Set(design.nodes.filter((n) => n.agent === "judge").map((n) => n.id));
  if (debaters.size === 0) return null;
  const seen = events.slice(0, cursor).filter((e) => e.type === "agent_start");
  if (seen.some((e) => judges.has(e.agent))) return { verdict: true, rounds: design.rounds };
  const turns = seen.filter((e) => debaters.has(e.agent)).length;
  return { verdict: false, round: Math.min(design.rounds, Math.max(1, Math.ceil(turns / debaters.size))), rounds: design.rounds };
}

// Where an evaluator loop stands at the cursor: which draft the writer is on, and whether the evaluator is judging it.
// Null for runs that are not evaluator loops. Each activation of an agent starts with an agent_start event.
export function evaluatorProgress(events, cursor) {
  const design = events.find((e) => e.type === "run_start")?.design;
  if (design?.pattern !== "evaluator" || !Number.isInteger(design.rounds)) return null;
  const writers = new Set(design.nodes.filter((n) => n.agent === "writer").map((n) => n.id));
  const seen = events.slice(0, cursor).filter((e) => e.type === "agent_start");
  // With self-critique the writer judges too: its second call of a round is marked `judging`.
  const drafts = seen.filter((e) => writers.has(e.agent) && e.judging !== true).length;
  const last = seen.at(-1);
  return { round: Math.min(design.rounds, Math.max(1, drafts)), rounds: design.rounds, phase: last && (!writers.has(last.agent) || last.judging === true) ? "judging" : "writing" };
}

// ---- map-reduce and plan-and-execute: a node that runs once for every part or step (agents "worker#1", "executor#2") ----
const runStatus = (seen, id) => (seen.some((e) => e.type === "agent_output" && e.agent === id) ? "done" : seen.some((e) => e.type === "agent_start" && e.agent === id) ? "working" : "waiting");

// The agents created up to the cursor: [{ id, name, instructions, by, n, max, status }] with the status of the agent
// (waiting until it starts, working, done). Empty when nothing was created.
export function createdOf(events, cursor = events.length) {
  const seen = events.slice(0, Math.max(0, cursor));
  return seen
    .filter((e) => e.type === "agent_created" && e.node)
    .map((e) => ({ id: e.agent, name: e.node.name ?? e.agent, instructions: e.node.instructions ?? "", by: e.by, n: e.n, max: e.max, status: runStatus(seen, e.agent) }));
}

// The requests to create an agent that were refused up to the cursor: [{ by, reason }].
export function refusalsOf(events, cursor = events.length) {
  return events.slice(0, Math.max(0, cursor)).filter((e) => e.type === "agent_refused").map((e) => ({ by: e.by, reason: e.reason }));
}

// The parts a splitter made, up to the cursor: [{ n, id, text, status }] with the status of the worker that has the part
// (waiting, working, done). Empty for other patterns and before the split.
export function partsOf(events, cursor = events.length) {
  const design = events.find((e) => e.type === "run_start")?.design;
  if (design?.pattern !== "mapreduce") return [];
  const splitter = design.nodes.find((n) => n.agent === "splitter");
  const worker = design.nodes.find((n) => n.agent === "worker");
  const seen = events.slice(0, cursor);
  return seen
    .filter((e) => e.type === "handoff" && e.from === splitter?.id && typeof e.to === "string" && e.to.startsWith(`${worker?.id}#`))
    .map((e, i) => ({ n: i + 1, id: e.to, text: typeof e.note === "string" ? e.note : "", status: runStatus(seen, e.to) }));
}

// The plan a planner made, up to the cursor: [{ n, id, text, status }] with the status of the step (waiting, working, done).
// Empty for other patterns, before the plan and when the planner's reply is not a valid plan.
export function planOf(events, cursor = events.length) {
  const design = events.find((e) => e.type === "run_start")?.design;
  if (design?.pattern !== "planexec") return [];
  const planner = design.nodes.find((n) => n.agent === "planner");
  const executor = design.nodes.find((n) => n.agent === "executor");
  const seen = events.slice(0, cursor);
  for (const event of [...seen].reverse()) {
    if (event.type !== "agent_output" || event.agent !== planner?.id) continue;
    const steps = parseStepsReply(event.text);
    if (steps) return steps.map((text, i) => ({ n: i + 1, id: `${executor.id}#${i + 1}`, text, status: runStatus(seen, `${executor.id}#${i + 1}`) }));
  }
  return [];
}

// How many runs a node has in a record: { total (parts or steps), started, done }. All zero for a node that runs once.
export function runsOfNode(events, nodeId, cursor = events.length) {
  const design = events.find((e) => e.type === "run_start")?.design;
  const node = design?.nodes?.find((n) => n.id === nodeId);
  if (!node || node.agent !== MULTI_RUN[design.pattern]) return { total: 0, started: 0, done: 0 };
  const seen = events.slice(0, cursor);
  const mine = (e) => typeof e.agent === "string" && e.agent.startsWith(`${nodeId}#`);
  const started = new Set(seen.filter((e) => e.type === "agent_start" && mine(e)).map((e) => e.agent)).size;
  const done = new Set(seen.filter((e) => e.type === "agent_output" && mine(e)).map((e) => e.agent)).size;
  const total = (design.pattern === "mapreduce" ? partsOf(events, cursor) : planOf(events, cursor)).length;
  return { total: Math.max(total, started), started, done };
}

// How a map-reduce or plan-and-execute run ended: { kind, result: "finished" | "stopped", total, done } (parts or steps).
// Null for other patterns, for failed runs and for runs with no end yet.
export function dynamicEnd(events) {
  const design = events.find((e) => e.type === "run_start")?.design;
  const done = events.find((e) => e.type === "done");
  if ((design?.pattern !== "mapreduce" && design?.pattern !== "planexec") || !done) return null;
  const node = design.nodes.find((n) => n.agent === MULTI_RUN[design.pattern]);
  const runs = runsOfNode(events, node.id);
  if (done.outcome === "finished") return { kind: design.pattern, result: "finished", total: runs.total, done: runs.done };
  if (done.outcome === "stopped_limit") return { kind: design.pattern, result: "stopped", total: runs.total, done: runs.done };
  return null;
}

// How an evaluator loop ended, from its loop_end event: { result, round, judged, rounds }. Null when the run has no such
// event (other patterns, and runs recorded before the evaluator loop existed).
export function loopOutcome(events) {
  const end = events.find((e) => e.type === "loop_end");
  if (!end) return null;
  const rounds = events.find((e) => e.type === "run_start")?.design?.rounds;
  const self = events.find((e) => e.type === "run_start")?.design?.selfCritique === true;
  return { result: end.result, round: end.round, judged: end.judged === true, rounds: Number.isInteger(rounds) ? rounds : end.round, ...(self ? { self } : {}) };
}

// Where a handoff run stands at the cursor: who holds control (the agent that started most recently), how many handoffs
// have happened and the path so far (the start, then each agent control went to). Null for other patterns.
export function handoffProgress(events, cursor) {
  const design = events.find((e) => e.type === "run_start")?.design;
  if (design?.pattern !== "handoff") return null;
  const seen = events.slice(0, cursor);
  const moves = seen.filter((e) => e.type === "handoff");
  const starts = seen.filter((e) => e.type === "agent_start");
  const path = [design.start, ...moves.map((e) => e.to)];
  // Between a handoff and the next agent_start, control already sits with the agent the handoff went to.
  const lastMove = seen.findLastIndex((e) => e.type === "handoff");
  const lastStart = seen.findLastIndex((e) => e.type === "agent_start");
  const holder = lastMove > lastStart ? seen[lastMove].to : (starts.at(-1)?.agent ?? design.start);
  return { holder, handoffs: moves.length, path };
}

// The whole path of a recorded handoff run. Null for other patterns.
export function handoffPath(events) {
  const design = events.find((e) => e.type === "run_start")?.design;
  if (design?.pattern !== "handoff") return null;
  return [design.start, ...events.filter((e) => e.type === "handoff").map((e) => e.to)];
}

// How a handoff run ended: finished (an agent decided the task was done) or stopped by a limit (nobody finished it).
// { result, handoffs, by, reason? }. Null for other patterns and for runs that failed, wait for approval or have no end yet.
export function handoffOutcome(events) {
  const design = events.find((e) => e.type === "run_start")?.design;
  if (design?.pattern !== "handoff") return null;
  const done = events.find((e) => e.type === "done");
  if (!done || (done.outcome !== "finished" && done.outcome !== "stopped_limit")) return null;
  const handoffs = events.filter((e) => e.type === "handoff").length;
  const by = events.filter((e) => e.type === "agent_start").at(-1)?.agent ?? design.start;
  return done.outcome === "finished" ? { result: "finished", handoffs, by } : { result: "stopped", handoffs, by, ...(done.reason ? { reason: done.reason } : {}) };
}

// The agent a message was handed over by: the messages of a handoff run say "Handed over by <label>:". Null for any other text.
export function handoffSender(text) {
  const found = typeof text === "string" ? /Handed over by ([^:\r\n]+):/.exec(text) : null;
  return found ? found[1].trim() : null;
}

// What a router run chose, up to the cursor: { to, reason } from its handoff event. Null for other patterns and before the choice.
export function routerChoice(events, cursor = events.length) {
  const design = events.find((e) => e.type === "run_start")?.design;
  if (design?.pattern !== "router") return null;
  const move = events.slice(0, cursor).find((e) => e.type === "handoff");
  return move ? { to: move.to, reason: typeof move.note === "string" ? move.note : "" } : null;
}

// How a router run ended: "answered" (the chosen specialist answered) or "stopped" (a limit before the answer).
// { result, to, reason }. Null for other patterns, for failed runs and for runs with no end yet.
export function routerEnd(events) {
  const design = events.find((e) => e.type === "run_start")?.design;
  const done = events.find((e) => e.type === "done");
  if (design?.pattern !== "router" || !done) return null;
  const choice = routerChoice(events);
  if (done.outcome === "finished" && choice) return { result: "answered", ...choice };
  if (done.outcome === "stopped_limit") return { result: "stopped", to: choice?.to ?? null, reason: choice?.reason ?? "" };
  return null;
}

// What the tally of a voting run decided, up to the cursor: { agree, votes, total, answer, note }. The decision is the
// last reply of the tally that reads as one (a repaired reply replaces a bad one). Null for other patterns and before it.
export function votingTally(events, cursor = events.length) {
  const design = events.find((e) => e.type === "run_start")?.design;
  if (design?.pattern !== "voting") return null;
  const tally = design.nodes.find((n) => n.agent === "tally");
  const voters = design.nodes.filter((n) => n.agent !== "tally").map((n) => n.id);
  for (const event of [...events.slice(0, cursor)].reverse()) {
    if (event.type !== "agent_output" || event.agent !== tally?.id) continue;
    const decision = parseVotingReply(event.text, voters);
    if (decision) return { agree: decision.agree, votes: decision.agree.length, total: voters.length, answer: decision.answer, note: decision.note };
  }
  return null;
}

// How a voting run ended: "majority" (more than half of the voters agree), "none" (no majority) or "stopped" (a limit
// before the tally decided). { result, votes, total, note }. Null for other patterns, for failed runs and runs with no end yet.
export function votingEnd(events) {
  const design = events.find((e) => e.type === "run_start")?.design;
  const done = events.find((e) => e.type === "done");
  if (design?.pattern !== "voting" || !done) return null;
  const tally = votingTally(events);
  const total = design.nodes.filter((n) => n.agent !== "tally").length;
  if (done.outcome === "finished" && tally) return { result: tally.votes * 2 > tally.total ? "majority" : "none", votes: tally.votes, total: tally.total, note: tally.note };
  if (done.outcome === "stopped_limit") return { result: "stopped", votes: tally?.votes ?? 0, total, note: tally?.note ?? "" };
  return null;
}
