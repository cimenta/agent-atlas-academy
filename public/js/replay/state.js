const SUMMARY_LENGTH = 80;

function clampCursor(cursor, length) {
  const n = Math.floor(Number(cursor));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(length, n));
}

function agentsInOrder(events) {
  const seen = [];
  const add = (id) => {
    if (typeof id === "string" && id && !seen.includes(id)) seen.push(id);
  };
  for (const event of events) {
    add(event.agent);
    if (event.type === "handoff") {
      add(event.from);
      add(event.to);
    }
  }
  return seen;
}

function summarise(event) {
  const short = (text) => (typeof text === "string" ? text.slice(0, SUMMARY_LENGTH) : "");
  switch (event.type) {
    case "run_start":
      return short(event.task);
    case "tool_call":
      return short(event.tool);
    case "tool_result":
      return short(event.tool);
    case "handoff":
      return `${event.from} → ${event.to}`;
    case "agent_output":
      return short(event.text);
    case "title":
      return short(event.text);
    case "warning":
    case "error":
      return short(event.message);
    default:
      return "";
  }
}

export function deriveState(events, cursor) {
  const applied = events.slice(0, clampCursor(cursor, events.length));
  const status = new Map(agentsInOrder(events).map((id) => [id, "waiting"]));
  const tokens = { input: 0, output: 0 };
  const steps = [];
  let finished = false;
  let error = null;

  applied.forEach((event, index) => {
    if (event.type === "agent_start" && status.has(event.agent)) status.set(event.agent, "working");
    if (event.type === "agent_output" && status.has(event.agent)) {
      status.set(event.agent, "done");
      const usage = event.tokens || {};
      if (Number.isFinite(usage.input)) tokens.input += usage.input;
      if (Number.isFinite(usage.output)) tokens.output += usage.output;
    }
    if (event.type === "done") finished = true;
    if (event.type === "error") error = typeof event.message === "string" ? event.message : "error";
    const step = { index, type: event.type, summary: summarise(event) };
    const agent = event.agent ?? event.from;
    if (typeof agent === "string") step.agent = agent;
    steps.push(step);
  });

  const agents = [...status].map(([id, state]) => ({ id, status: state }));
  return {
    agents,
    activeAgents: agents.filter((a) => a.status === "working").map((a) => a.id),
    steps,
    tokens,
    finished,
    error,
  };
}
