// Pure helpers that turn replay state into plain data for the view.

export function buildGraphModel(state) {
  return {
    nodes: state.agents.map((agent) => ({
      id: agent.id,
      label: agent.id,
      status: agent.status,
      active: state.activeAgents.includes(agent.id),
    })),
  };
}

export function buildTimelineModel(events, cursor, explanations) {
  const applied = events.slice(0, Math.max(0, Math.min(events.length, cursor)));
  const items = applied.map((event, index) => {
    const item = {
      index,
      type: event.type,
      current: index === applied.length - 1,
    };
    const agent = event.agent ?? event.from;
    if (typeof agent === "string") item.agent = agent;
    const explanation = explanations && explanations[String(index)];
    if (typeof explanation === "string") item.explanation = explanation;
    return item;
  });
  return { items };
}

const KNOWN_TYPES = new Set([
  "run_start",
  "agent_start",
  "round",
  "tool_call",
  "tool_result",
  "handoff",
  "warning",
  "title",
  "agent_output",
  "done",
  "error",
]);

export function describeStep(step) {
  const key = KNOWN_TYPES.has(step.type) ? `step.${step.type}` : "step.unknown";
  return { key, params: { agent: step.agent ?? "", summary: step.summary ?? "" } };
}

export function stepMessage(event) {
  const text = (value) => (typeof value === "string" ? value : "");
  switch (event.type) {
    case "run_start":
      return text(event.task);
    case "agent_start":
      return text(event.role);
    case "agent_output":
    case "title":
      return text(event.text);
    case "tool_call": {
      const input =
        typeof event.input === "string" ? event.input : JSON.stringify(event.input, null, 2) ?? "";
      return `${text(event.tool)}\n${input}`;
    }
    case "tool_result":
      return typeof event.output === "string" ? event.output : text(event.text);
    case "handoff":
      return text(event.note);
    case "warning":
    case "error":
      return text(event.message);
    default:
      return "";
  }
}
