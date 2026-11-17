// The Harness lab: a recorded run is played against limits the visitor sets, with no provider call.
// Pure: no DOM. The rules follow the budget of the engine (budget.js): a step that would pass the step limit is
// not taken, and a step that passes the token or time limit is the last one; the run then stops without its final answer.
import { clampRepeatStop } from "./engine/catalog.js";

const sameText = (text) => String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();

// The model calls of a run, in order: the agent, the tokens of the call, when it ended (ms) and the answer the agent
// gave when this call was its last one.
export function labSteps(run) {
  const steps = [];
  for (const e of run?.events ?? []) {
    if (e.type === "round") steps.push({ agent: e.agent, tokens: (Number(e.usage?.input) || 0) + (Number(e.usage?.output) || 0), ms: Number(e.t) || 0, answer: null });
    else if (e.type === "agent_output") {
      const last = [...steps].reverse().find((s) => s.agent === e.agent && s.answer === null);
      if (last) last.answer = typeof e.text === "string" ? e.text : "";
    }
  }
  return steps;
}

export function labTotals(steps) {
  return { steps: steps.length, tokens: steps.reduce((sum, s) => sum + s.tokens, 0), sec: Math.ceil((steps.at(-1)?.ms ?? 0) / 1000) };
}

const roundUp = (value, unit) => Math.ceil(value / unit) * unit;

// The ranges of the sliders for a run: a little above what the run used, so the default lets it finish.
export function labRanges(steps) {
  const totals = labTotals(steps);
  const tokenStep = totals.tokens >= 10000 ? 1000 : 500;
  return {
    steps: { min: 1, max: totals.steps + 3, step: 1 },
    tokens: { min: tokenStep, max: Math.max(tokenStep * 2, roundUp(totals.tokens * 1.25, tokenStep)), step: tokenStep },
    time: { min: 10, max: Math.min(270, Math.max(20, roundUp(totals.sec * 1.25, 10))), step: 10 },
  };
}

// limits: { maxSteps, maxTokens, timeSec, repeatStop (0 is off) }.
// Returns the status of each step (done, stop, after), why the run stopped (null when it finished) and what was used.
export function simulate(steps, limits) {
  const repeatLimit = clampRepeatStop(limits.repeatStop);
  const rows = steps.map(() => "after");
  const used = { steps: 0, tokens: 0, sec: 0 };
  const lastAnswer = new Map();
  const inARow = new Map();
  let stop = null;
  for (let i = 0; i < steps.length && !stop; i++) {
    const s = steps[i];
    if (used.steps + 1 > limits.maxSteps) {
      rows[i] = "stop";
      stop = { index: i, reason: "steps", value: limits.maxSteps };
      break;
    }
    used.steps += 1;
    used.tokens += s.tokens;
    used.sec = s.ms / 1000;
    rows[i] = "done";
    if (used.sec >= limits.timeSec) stop = { index: i, reason: "time", value: limits.timeSec };
    else if (used.tokens > limits.maxTokens) stop = { index: i, reason: "tokens", value: limits.maxTokens };
    else if (s.answer !== null) {
      const now = sameText(s.answer);
      const count = now !== "" && now === lastAnswer.get(s.agent) ? (inARow.get(s.agent) ?? 1) + 1 : 1;
      lastAnswer.set(s.agent, now);
      inARow.set(s.agent, count);
      if (repeatLimit > 0 && now !== "" && count >= repeatLimit) stop = { index: i, reason: "repeat", value: count };
    }
    if (stop) rows[i] = "stop";
  }
  return { rows, stop, used, finished: stop === null };
}
