import { PROVIDERS } from "./providers.js";
import { nodeProvider } from "./catalog.js";
import { ToolError, calculate, clockText, countText, OWN_TOOL_KEYS } from "./own-tools.js";
import { wikipediaText, weatherText } from "./web-tools.js";
import { searchDocuments } from "./documents.js";
import { notesToolText } from "./notebook.js";
// The tools an agent can be given. Each entry says what it is, whether it costs
// extra, and how to describe it to the provider. Adding a tool is a new entry.
//   kind "provider": the provider runs it inside its own call (web search).
//   kind "own": the model asks for it, the engine runs `run(args, context)` and sends the result back (see engine/agent.js).

const ARGUMENT_TEXT_MAX = 4000; // the longest result of a tool that goes back to the model

export const TOOLS = {
  web_search: {
    key: "web_search",
    label: "Web search",
    kind: "provider",
    extraFee: true,
    // Anthropic's web search runs inside the API call. Check the current tool
    // type string in Anthropic's documentation before each release.
    definition: (maxUses) => ({ type: "web_search_20250305", name: "web_search", max_uses: maxUses }),
  },
  calculator: {
    key: "calculator",
    label: "Calculator",
    kind: "own",
    extraFee: false,
    description: "Calculates an arithmetic expression exactly. Use it for any calculation instead of working it out yourself. Supports + - * / ^ %, brackets, sqrt, abs, round(x, digits), floor, ceil, min, max, sin, cos, tan, ln, log10, exp, and the constants pi and e. Write decimals with a point.",
    schema: { type: "object", properties: { expression: { type: "string", description: "The expression, for example (1250 * 0.21) + 99" } }, required: ["expression"] },
    run: (args) => calculate(args?.expression),
  },
  datetime: {
    key: "datetime",
    label: "Date and time",
    kind: "own",
    extraFee: false,
    description: "Gives the current date, time, weekday and week number. You do not know today's date, so use this whenever the date or the time matters.",
    schema: { type: "object", properties: { timezone: { type: "string", description: "An IANA time zone such as Europe/Prague. UTC when left out." } } },
    run: (args, context) => clockText(args ?? {}, context?.now ?? Date.now()),
  },
  wikipedia: {
    key: "wikipedia",
    label: "Wikipedia",
    kind: "own",
    extraFee: false,
    description: "Looks a subject up on Wikipedia and returns the title, a summary of about 1200 characters and the address of the page. Use it for facts about people, places, events and things instead of answering from memory.",
    schema: { type: "object", properties: { query: { type: "string", description: "What to look up, for example Alan Turing." }, language: { type: "string", enum: ["en", "cs"], description: "The Wikipedia language: en (default) or cs." } }, required: ["query"] },
    run: (args, context) => wikipediaText(args ?? {}, { fetchImpl: context?.fetch, timeoutMs: context?.timeoutMs }),
  },
  weather: {
    key: "weather",
    label: "Weather",
    kind: "own",
    extraFee: false,
    description: "Gives the weather now and for the next 3 days at a place: temperature, rain and wind. You cannot know the weather, so use this whenever it matters.",
    schema: { type: "object", properties: { place: { type: "string", description: "A town or place, for example Brno." } }, required: ["place"] },
    run: (args, context) => weatherText(args ?? {}, { fetchImpl: context?.fetch, timeoutMs: context?.timeoutMs }),
  },
  text_stats: {
    key: "text_stats",
    label: "Text counting",
    kind: "own",
    extraFee: false,
    description: "Counts a text exactly: characters, words, sentences, lines and the longest word, and, with letter, how many times one letter is in it. Use it whenever you must count in a text, because you cannot count reliably yourself.",
    schema: { type: "object", properties: { text: { type: "string", description: "The text to count." }, letter: { type: "string", description: "One letter to count in the text (optional)." } }, required: ["text"] },
    run: (args) => countText(args ?? {}),
  },
  document_search: {
    key: "document_search",
    label: "Search in my documents",
    kind: "own",
    extraFee: false,
    description: "Searches the documents the student added to this run and returns up to 3 passages with the most of your search words, with where they are. The documents are not in your prompt: you only see what this tool returns, so search before you answer about them, with the words the document would use.",
    schema: { type: "object", properties: { query: { type: "string", description: "The words to look for, for example refund deadline." } }, required: ["query"] },
    run: (args, context) => searchDocuments(args ?? {}, context?.documents),
  },
  notes: {
    key: "notes",
    label: "Notes of the run",
    kind: "own",
    extraFee: false,
    description: "The shared notebook of this run, which every agent with the notebook can read. With action write, saves a short note (under 600 characters) for the agents that come later, for example a fact or a decision. With action read, returns the notes so far. The notes are not part of your answer.",
    schema: { type: "object", properties: { action: { type: "string", enum: ["write", "read"], description: "write saves a note, read returns the notes so far." }, text: { type: "string", description: "The note to save (action write only)." } }, required: ["action"] },
    run: (args, context) => notesToolText(args ?? {}, context?.notes ?? null),
  },
};

export { OWN_TOOL_KEYS };

// The description of an own tool as the providers take it (the shape of Anthropic tools; the adapters convert it).
export const toolDefinition = (key) => ({ name: key, description: TOOLS[key].description, input_schema: TOOLS[key].schema });

// Runs a tool of ours. It never throws: what goes wrong becomes a text that the model reads and decides on.
export async function runTool(key, args, context = {}) {
  const tool = TOOLS[key];
  const started = Date.now();
  if (!tool || tool.kind !== "own") return { output: `There is no tool named ${key}.`, error: true, ms: 0 };
  try {
    const output = String(await tool.run(args, context)).slice(0, ARGUMENT_TEXT_MAX);
    return { output, error: false, ms: Date.now() - started };
  } catch (error) {
    const output = error instanceof ToolError ? error.message : `The tool ${key} failed.`;
    return { output, error: true, ms: Date.now() - started };
  }
}

// The keys of the own tools of a node, without repeats and without names we do not know.
export const ownToolKeys = (node) => [...new Set(Array.isArray(node?.tools) ? node.tools : [])].filter((key) => OWN_TOOL_KEYS.includes(key));

// provider: the provider of the run, used for an agent that has no key slot of its own. A provider that cannot search gives no search tool.
// own: false leaves out the tools of ours (the rounds of tools of one answer are used up, so the model has to answer).
export function toolsFor(node, budget, provider = "anthropic", { own = true } = {}) {
  const ownDefs = own ? ownToolKeys(node).map(toolDefinition) : [];
  const canSearch = PROVIDERS[nodeProvider(node, provider)]?.capabilities?.search !== false;
  const remaining = budget.remainingSearches();
  // Gemini does not take its search and functions in one request: the functions are kept, and the search is left out.
  const searchOk = node.search === true && remaining > 0 && canSearch && !(ownDefs.length > 0 && nodeProvider(node, provider) === "google");
  return [...(searchOk ? [TOOLS.web_search.definition(remaining)] : []), ...ownDefs];
}
