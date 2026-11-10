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

export function deriveInspector(events, cursor = events.length) {
  const applied = events.slice(0, Math.max(0, Math.min(events.length, cursor)));
  const agents = {};
  const order = agentIds(events);
  for (const id of order) agents[id] = emptyAgent(id);
  const state = { task: "", order, agents, warnings: [], error: null, finished: false, tokens: { input: 0, output: 0 } };

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
        if (typeof event.role === "string" && event.role) agent.label = event.role;
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
        break;
      case "done":
        state.finished = true;
        break;
      case "error":
        state.error = typeof event.message === "string" ? event.message : "error";
        for (const a of Object.values(agents)) if (a.status === "working") a.status = "error";
        break;
      default:
        break;
    }
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
