export const RUN_SCHEMA_VERSION = 1;

export const EVENT_TYPES = [
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
];

const isText = (value) => typeof value === "string" && value.length > 0;
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

function checkEvent(event, index, previousT, errors, agents) {
  const at = `events[${index}]`;
  if (!isObject(event)) {
    errors.push(`${at} must be an object`);
    return previousT;
  }
  if (!EVENT_TYPES.includes(event.type)) {
    errors.push(`${at}.type must be one of: ${EVENT_TYPES.join(", ")}`);
  }
  if (typeof event.t !== "number" || !Number.isFinite(event.t)) {
    errors.push(`${at}.t must be a finite number`);
  } else {
    if (previousT !== null && event.t < previousT) {
      errors.push(`${at}.t must not be smaller than the previous event's t`);
    }
    previousT = event.t;
  }
  if (["agent_start", "agent_output", "tool_call", "tool_result", "round"].includes(event.type) && !isText(event.agent)) {
    errors.push(`${at}.agent must be a non-empty string`);
  }
  if (isText(event.agent) && !agents.has(event.agent)) {
    errors.push(`${at}.agent "${event.agent}" never starts (no agent_start event)`);
  }
  if (event.type === "handoff") {
    for (const key of ["from", "to"]) {
      if (!isText(event[key])) errors.push(`${at}.${key} must be a non-empty string`);
      else if (!agents.has(event[key])) errors.push(`${at}.${key} "${event[key]}" never starts (no agent_start event)`);
    }
  }
  if (event.tokens !== undefined) {
    const usage = event.tokens;
    for (const key of ["input", "output"]) {
      const value = isObject(usage) ? usage[key] : undefined;
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
        errors.push(`${at}.tokens.${key} must be a non-negative number`);
      }
    }
  }
  if (event.type === "agent_output" && typeof event.text !== "string") {
    errors.push(`${at}.text must be a string`);
  }
  if (event.type === "tool_result" && typeof event.output !== "string" && typeof event.text !== "string") {
    errors.push(`${at}.output (or text) must be a string`);
  }
  return previousT;
}

export function validateRun(run) {
  const errors = [];
  if (!isObject(run)) return { ok: false, errors: ["The run must be an object"] };
  if (run.schemaVersion !== RUN_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${RUN_SCHEMA_VERSION}`);
  }
  for (const key of ["id", "title", "language", "pattern", "appVersion"]) {
    if (!isText(run[key])) errors.push(`${key} must be a non-empty string`);
  }
  if (!isObject(run.recordedWith) || !isText(run.recordedWith.provider) || !isText(run.recordedWith.model)) {
    errors.push("recordedWith must have a provider and a model");
  }
  if (!Array.isArray(run.events) || run.events.length === 0) {
    errors.push("events must be a non-empty list");
  } else {
    const agents = new Set(
      run.events.filter((e) => isObject(e) && e.type === "agent_start" && isText(e.agent)).map((e) => e.agent),
    );
    let previousT = null;
    run.events.forEach((event, index) => {
      previousT = checkEvent(event, index, previousT, errors, agents);
    });
  }
  return { ok: errors.length === 0, errors };
}
