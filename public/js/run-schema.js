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
  "approval",
  "approved",
  "loop_end",
  "note",
  "condense",
  "agent_created",
  "agent_refused",
  "handoff_refused",
  "format_check",
  "guardrail_check",
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
  // A created agent is announced before it starts (and may never start), so its announcement is not checked against the starts.
  if (isText(event.agent) && event.type !== "agent_created" && !agents.has(event.agent)) {
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
  if (event.type === "condense" && (!isText(event.agent) || typeof event.text !== "string" || !Number.isFinite(event.from) || !Number.isFinite(event.to))) {
    errors.push(`${at}.agent, ${at}.text, ${at}.from and ${at}.to of a condense must be a string, a string and two numbers`);
  }
  if (event.type === "agent_created" && (!isText(event.by) || !isText(event.agent) || !isObject(event.node) || !isText(event.node.id))) {
    errors.push(`${at}.by, ${at}.agent and ${at}.node of a creation must be a string, a string and an object with an id`);
  }
  if (event.type === "agent_refused" && (!isText(event.by) || !isText(event.reason))) {
    errors.push(`${at}.by and ${at}.reason of a refusal must be strings`);
  }
  if (event.type === "handoff_refused" && (!isText(event.from) || !isText(event.to) || !isText(event.reason))) {
    errors.push(`${at}.from, ${at}.to and ${at}.reason of a refused handoff must be strings`);
  }
  if (event.type === "format_check" && (!isText(event.agent) || typeof event.ok !== "boolean" || ![1, 2].includes(event.attempt) || !Array.isArray(event.problems) || !event.problems.every((p) => typeof p === "string"))) {
    errors.push(`${at}.agent, ${at}.ok, ${at}.attempt and ${at}.problems of a format check must be a string, a boolean, 1 or 2, and a list of strings`);
  }
  if (event.type === "guardrail_check" && (!isText(event.agent) || !Number.isInteger(event.guardrail) || event.guardrail < 1 || event.guardrail > 3 || !["input", "output"].includes(event.where) || !["secret", "words", "length", "reviewer"].includes(event.kind) || typeof event.ok !== "boolean" || ![1, 2].includes(event.attempt) || !["passed", "noted", "repair", "stopped"].includes(event.action) || typeof event.reason !== "string")) {
    errors.push(`${at}.agent, ${at}.guardrail, ${at}.where, ${at}.kind, ${at}.ok, ${at}.attempt, ${at}.action and ${at}.reason of a guardrail check must be valid (a string, 1 to 3, input or output, a kind, a boolean, 1 or 2, an action and a string)`);
  }
  if (event.type === "note" && (!isText(event.agent) || typeof event.text !== "string")) {
    errors.push(`${at}.agent and ${at}.text of a note must be strings`);
  }
  if (event.type === "agent_output" && typeof event.text !== "string") {
    errors.push(`${at}.text must be a string`);
  }
  if (event.type === "tool_result" && typeof event.output !== "string" && typeof event.text !== "string") {
    errors.push(`${at}.output (or text) must be a string`);
  }
  return previousT;
}

// The optional About section of a run: who made it and what it shows. The description is Markdown.
export const ABOUT_FIELDS = ["title", "author", "url", "description"];
export const ABOUT_LIMITS = { title: 120, author: 120, url: 500, description: 5000 };

function checkAbout(about, errors) {
  if (!isObject(about)) {
    errors.push("about must be an object");
    return;
  }
  for (const key of Object.keys(about)) {
    if (!ABOUT_FIELDS.includes(key)) errors.push(`about.${key} is not a known field`);
  }
  for (const key of ABOUT_FIELDS) {
    const value = about[key];
    if (value === undefined) continue;
    if (typeof value !== "string") errors.push(`about.${key} must be a string`);
    else if (value.length > ABOUT_LIMITS[key]) errors.push(`about.${key} must be at most ${ABOUT_LIMITS[key]} characters`);
  }
  if (typeof about.url === "string" && about.url !== "" && !/^https?:\/\/\S+$/i.test(about.url)) errors.push("about.url must start with http:// or https://");
}

export function validateRun(run) {
  const errors = [];
  if (!isObject(run)) return { ok: false, errors: ["The run must be an object"] };
  if (run.about !== undefined) checkAbout(run.about, errors);
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
      // An agent that waited for approval and was stopped there never started, but it is part of the run.
      run.events.filter((e) => isObject(e) && (e.type === "agent_start" || e.type === "approval") && isText(e.agent)).map((e) => e.agent),
    );
    let previousT = null;
    run.events.forEach((event, index) => {
      previousT = checkEvent(event, index, previousT, errors, agents);
    });
  }
  return { ok: errors.length === 0, errors };
}
