// Which arrows of the diagram have carried data so far in a replay, and which one carried it last.
// Pure: no DOM. Arrow keys are "from>to" for a handoff and "turn:from>to" for the turn order of a debate.

// What each debater turn is: the first debater of a round starts the round, every other one answers the
// debater before it. Turn arrows light up when the next debater starts.
function debaterIds(design) {
  return (design?.nodes ?? []).filter((n) => n.agent === "debater").map((n) => n.id);
}

export function flowState(events, cursor, design) {
  const applied = events.slice(0, Math.max(0, Math.min(events.length, cursor)));
  const used = new Set();
  let latest = null;
  const debaters = debaterIds(design);
  let previousDebater = null;
  applied.forEach((event, index) => {
    let key = null;
    if (event.type === "handoff" && typeof event.from === "string" && typeof event.to === "string") key = `${event.from}>${event.to}`;
    if (event.type === "agent_start" && debaters.includes(event.agent)) {
      if (previousDebater !== null) key = `turn:${previousDebater}>${event.agent}`;
      previousDebater = event.agent;
    }
    if (key !== null) {
      used.add(key);
      latest = { key, index };
    }
  });
  return { used, latest };
}
