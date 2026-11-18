// One clock for several recorded runs, so they can be played side by side.
// Two ways to line them up: by time (the same moment in every run) or by step (the same number of events).
import { buildResultModel } from "./play-model.js";

const STEP_MS = 700;
const events = (run) => (Array.isArray(run?.events) ? run.events : []);
const finite = (n) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

export const durationOf = (list) => (Array.isArray(list) && list.length > 0 ? finite(list.at(-1)?.t) : 0);

// How many events are revealed at a position.
export function cursorAt(list, mode, position) {
  const all = Array.isArray(list) ? list : [];
  if (mode === "step") return Math.max(0, Math.min(Math.floor(position), all.length));
  let n = 0;
  while (n < all.length && finite(all[n].t) <= position) n += 1;
  return n;
}

// The running figures of a run after its first `cursor` events.
export function totalsAt(run, cursor) {
  const shown = events(run).slice(0, Math.max(0, cursor));
  let tokens = 0;
  for (const e of shown) if (e?.type === "round") tokens += finite(e.usage?.input) + finite(e.usage?.output);
  // The cost is priced from the tokens of each agent. Until an agent has finished, count the tokens of its calls so far,
  // so that the cost grows together with the tokens.
  const perAgent = new Map();
  for (const e of shown) {
    if (e?.type !== "round" || typeof e.agent !== "string") continue;
    const sum = perAgent.get(e.agent) ?? { input: 0, output: 0 };
    sum.input += finite(e.usage?.input);
    sum.output += finite(e.usage?.output);
    perAgent.set(e.agent, sum);
  }
  const outputs = shown.filter((e) => e?.type === "agent_output");
  const covered = new Set(perAgent.keys());
  const priced = [...shown.filter((e) => e?.type !== "agent_output"), ...outputs.filter((e) => !covered.has(e.agent))];
  for (const [agent, sum] of perAgent) priced.push({ type: "agent_output", agent, text: "", tokens: sum });
  let cost = null;
  try {
    const c = buildResultModel({ ...run, events: priced }).cost;
    cost = typeof c === "number" && Number.isFinite(c) ? c : null;
  } catch {
    cost = null;
  }
  return { ms: shown.length > 0 ? finite(shown.at(-1)?.t) : 0, tokens, cost };
}

export function createCompareClock({ runs, mode = "time", clock, tickMs = 100 }) {
  const list = Array.isArray(runs) ? runs : [];
  let currentMode = mode === "step" ? "step" : "time";
  let position = 0;
  let speed = 1;
  let playing = false;
  let timer = null;
  const listeners = new Set();

  const longest = () => list.reduce((best, r) => (durationOf(events(r)) > durationOf(events(best)) ? r : best), list[0]);
  const maxOf = (m) => (m === "step" ? Math.max(0, ...list.map((r) => events(r).length)) : Math.max(0, ...list.map((r) => durationOf(events(r)))));
  const clamp = (p) => Math.max(0, Math.min(finite(p), maxOf(currentMode)));
  const notify = () => listeners.forEach((fn) => fn(api));
  const clear = () => {
    if (timer !== null) {
      clock.clearTimeout(timer);
      timer = null;
    }
  };
  const stop = () => {
    playing = false;
    clear();
  };
  const schedule = () => {
    clear();
    if (!playing) return;
    timer = clock.setTimeout(tick, currentMode === "step" ? STEP_MS / speed : tickMs);
  };
  function tick() {
    timer = null;
    position = clamp(position + (currentMode === "step" ? 1 : tickMs * speed));
    if (position >= maxOf(currentMode)) playing = false;
    else schedule();
    notify();
  }
  const eventTimes = () => [...new Set(list.flatMap((r) => events(r).map((e) => finite(e.t))))].sort((a, b) => a - b);

  const api = {
    get mode() { return currentMode; },
    get position() { return position; },
    get max() { return maxOf(currentMode); },
    get playing() { return playing; },
    get speed() { return speed; },
    setMode(m) {
      const next = m === "step" ? "step" : "time";
      if (next === currentMode) return;
      const ref = events(longest());
      position = next === "step" ? cursorAt(ref, "time", position) : finite(ref[Math.max(0, Math.floor(position) - 1)]?.t) * (position > 0 ? 1 : 0);
      currentMode = next;
      position = clamp(position);
      schedule();
      notify();
    },
    play() {
      if (position >= maxOf(currentMode)) position = 0;
      if (maxOf(currentMode) === 0) return;
      playing = true;
      schedule();
      notify();
    },
    pause() {
      stop();
      notify();
    },
    seek(p) {
      position = clamp(p);
      if (position >= maxOf(currentMode)) stop();
      notify();
    },
    next() {
      stop();
      position = currentMode === "step" ? clamp(position + 1) : (eventTimes().find((t) => t > position) ?? maxOf("time"));
      notify();
    },
    prev() {
      stop();
      position = currentMode === "step" ? clamp(position - 1) : ([...eventTimes()].reverse().find((t) => t < position) ?? 0);
      notify();
    },
    restart() {
      stop();
      position = 0;
      notify();
    },
    setSpeed(x) {
      if (typeof x === "number" && Number.isFinite(x) && x > 0) speed = x;
      schedule();
      notify();
    },
    cursors() {
      return list.map((r) => cursorAt(events(r), currentMode, position));
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return api;
}
