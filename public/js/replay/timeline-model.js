// The timeline of a run: one lane for each agent, the work of an agent as bars on a real time axis, the handoffs as arrows from the
// end of the sender to the start of the receiver. It is read from the events of the whole run (future steps are drawn faint).
// Pure: no DOM.
import { deriveInspector } from "./inspect-model.js";
import { originOf } from "./step-model.js";

const WAIT_SHARE = 0.03; // a gap in the work of an agent shorter than this share of the run is not drawn as waiting

export const runTotal = (events) => Math.max(1, ...events.filter((e) => typeof e?.t === "number").map((e) => e.t));

// The time on the run clock where the player stands: nothing is revealed at 0, the whole run at the end.
export function timeAtCursor(events, cursor) {
  if (cursor <= 0) return 0;
  if (cursor >= events.length) return runTotal(events);
  return events[cursor - 1]?.t ?? 0;
}

// How many events have happened by this time (the cursor the player needs to show it).
export function cursorAtTime(events, time) {
  let n = 0;
  while (n < events.length && (events[n].t ?? 0) <= time) n++;
  return n;
}

export function timelineOf(events, pattern = null) {
  const state = deriveInspector(events);
  const total = runTotal(events);
  const bars = [];
  const arrows = [];
  for (const id of state.order) {
    state.agents[id].steps.forEach((step, index) => {
      const key = `${id}:${index}`;
      const origin = originOf(step, pattern);
      if (step.kind === "handoff" && !step.created && !step.refused) {
        const from = state.agents[step.from];
        const to = state.agents[step.to];
        arrows.push({ key, from: step.from, to: step.to, fromT: from?.endT ?? step.at ?? 0, toT: to?.startT ?? step.at ?? 0, at: step.at ?? 0, chars: typeof step.output === "string" ? step.output.length : 0, eventIndex: step.eventIndex });
        return;
      }
      const end = typeof step.at === "number" ? step.at : 0;
      const length = typeof step.ms === "number" ? step.ms : 0;
      bars.push({ key, agent: id, origin, kind: step.kind, start: Math.max(0, end - length), end, point: length === 0, eventIndex: step.eventIndex });
    });
  }
  // Where an agent was waiting: before its first work and between its pieces of work.
  const waits = [];
  for (const id of state.order) {
    const work = bars.filter((b) => b.agent === id && !b.point).sort((a, b) => a.start - b.start);
    const first = state.agents[id].startT;
    if (work.length === 0 && first === null) continue;
    let previous = 0;
    for (const b of work) {
      if (b.start - previous > total * WAIT_SHARE) waits.push({ agent: id, start: previous, end: b.start });
      previous = Math.max(previous, b.end);
    }
  }
  const done = state.order.filter((id) => typeof state.agents[id].endT === "number").map((id) => ({ agent: id, t: state.agents[id].endT }));
  return { state, order: state.order, total, bars, arrows, waits, done };
}
