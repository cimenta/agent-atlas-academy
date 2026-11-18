// The condensings of a run as the replay shows them: what was shortened before an agent read it, revealed up to the cursor.
// Everything comes from the recorded condense events.
export function condensesOf(events, cursor = events?.length ?? 0) {
  const list = Array.isArray(events) ? events : [];
  const out = [];
  for (const event of list.slice(0, Math.max(0, cursor))) {
    if (event?.type !== "condense" || typeof event.agent !== "string" || event.kept === false) continue;
    out.push({
      agent: event.agent,
      from: Number(event.from) || 0,
      to: Number(event.to) || 0,
      text: String(event.text ?? ""),
      material: typeof event.material === "string" ? event.material : null,
      tokens: (Number(event.usage?.input) || 0) + (Number(event.usage?.output) || 0),
    });
  }
  return out;
}
