// What one agent passes on to the next. With a size set, a longer text is cut and the next agent is told so; the
// replay keeps the whole answer. The same text is cut (and warned about) once.
export function createPassOn({ chars = 0, emit = () => {} } = {}) {
  const seen = new Map();
  return function passOn(text, from) {
    if (!chars || typeof text !== "string" || text.length <= chars) return text;
    const key = `${from}\u0000${text}`;
    if (seen.has(key)) return seen.get(key);
    const cut = `${text.slice(0, chars)}\n\n[Cut: the first ${chars} of ${text.length} characters were passed on.]`;
    seen.set(key, cut);
    emit({ type: "warning", agent: from, handoff: { from, chars: text.length, kept: chars }, message: `The answer of ${from} was cut from ${text.length} to ${chars} characters before it went on. Raise the size of a handoff in Settings, Harness, if the end of the answer matters.` });
    return cut;
  };
}
