// How long a student needs to study a run: read it, understand it and look at every tab. One method for the whole Library, and the same one
// that helps the author of a run to fill in the study time. Pure: it gets counts (words, agents, calls) and returns seconds, so it is easy to test.
// Method 1 (see docs/design/2026-11-24-study-time-method.md). Every number is a named constant, so the method can be argued about and changed.
export const STUDY = {
  wordsPerMinute: 160, // reading new technical text so that it is understood (skimming is 200 to 250)
  patternReadSeconds: 20, // grasping the one-line description of the pattern
  perAgentSeconds: 15, // understanding what one agent is for and how it differs from the others
  diagramSeconds: 30, // looking at the diagram and following the arrows once
  sectionSeconds: 20, // connecting one written section (about, how, watch) with the diagram
  noteSeconds: 10, // matching one note of the replay with the step it explains
  secondPassShare: 0.3, // the second look at the replay needs half the reading of the first, but never less than the run time
  passes: 2,
  resultSeconds: 20, // the result tab on top of the final text, which was read in the replay
  statsSeconds: 30, // the numbers: time, tokens, price, and what they mean
  settingsBaseSeconds: 20, // the settings tab
  settingsPerAgentSeconds: 10, // provider and model of one agent
  apiCallSeconds: 10, // reading one call of the API log (request, reply, what the app added)
  apiCallsMax: 6, // a long log is read in samples
  understandingShare: 0.1, // slack for stopping, going back and thinking
  repeatedShare: 0.3, // an output that only rewrites what was already read still has to be checked, so it never costs less than this share
  minMinutes: 3,
};

const words = (text) => (typeof text === "string" && text.trim() !== "" ? text.trim().split(/\s+/).length : 0);
export const countWords = words;

const bag = (text) => (typeof text === "string" ? text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [] : []);

// The words of the outputs that are new to the student: a writer that polishes the text of the researcher is read faster than a text with new facts.
// Returns the count of words to read at full attention, in the order of the outputs.
export function newWords(texts, c = STUDY) {
  const seen = new Set();
  let total = 0;
  for (const text of texts) {
    const list = bag(text);
    if (list.length === 0) continue;
    const fresh = list.filter((w) => !seen.has(w)).length;
    total += list.length * Math.max(c.repeatedShare, fresh / list.length);
    for (const w of list) seen.add(w);
  }
  return total;
}

// parts: { patternText, agents, taskText, outputs: [text], notes: [text], sections: [text], runSeconds, apiCalls }
// Returns { seconds: { pattern, texts, replay, tabs, slack }, total, minutes }.
export function studyTime(parts, c = STUDY) {
  const read = (n) => (n / c.wordsPerMinute) * 60;
  const agents = Math.max(0, parts.agents ?? 0);
  const pattern = read(words(parts.patternText)) + c.patternReadSeconds + agents * c.perAgentSeconds + c.diagramSeconds;
  const sections = (parts.sections ?? []).filter((s) => words(s) > 0);
  const texts = sections.reduce((sum, s) => sum + read(words(s)) + c.sectionSeconds, 0);
  const material = read(newWords([parts.taskText, ...(parts.outputs ?? [])], c));
  const notes = (parts.notes ?? []).reduce((sum, n) => sum + read(words(n)) + c.noteSeconds, 0);
  const run = Number.isFinite(parts.runSeconds) && parts.runSeconds > 0 ? parts.runSeconds : 0;
  const first = Math.max(run, material + notes);
  const next = Math.max(run, (material + notes) * c.secondPassShare);
  const replay = first + Math.max(0, c.passes - 1) * next;
  const calls = Math.min(parts.apiCalls ?? 0, c.apiCallsMax);
  const tabs = c.resultSeconds + c.statsSeconds + c.settingsBaseSeconds + agents * c.settingsPerAgentSeconds + calls * c.apiCallSeconds;
  const subtotal = pattern + texts + replay + tabs;
  const slack = subtotal * c.understandingShare;
  const total = subtotal + slack;
  return { seconds: { pattern, texts, replay, tabs, slack }, total, minutes: Math.max(c.minMinutes, Math.round(total / 60)) };
}
