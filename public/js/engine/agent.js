// One agent in a run: keeps its own conversation, calls the model, reports events.
import { nodeModel, AGENT_TYPES, OUTPUT_TOKENS, RETRIES, RETRY_DELAY_SEC, REPEAT_STOP, MAX_PAUSES, clampOutputTokens, clampRetries, clampRetryDelaySec, clampRepeatStop, fallbackModelFor } from "./catalog.js";
import { systemPromptFor } from "./prompts.js";
import { toolsFor } from "./tools.js";
import { AnthropicError, redact } from "./anthropic.js";
import { agentLabel } from "./labels.js";
import { AgentLimitError, LimitError } from "./budget.js";
import { agentPassMessage } from "./harness.js";
import { usageCostUsd } from "./cost.js";
import { ApprovalPause, APPROVAL_INPUT_MAX } from "./approval.js";
import { notebookRole, extractNotes } from "./notebook.js";
import { splitInput, mayCondense, condenseInstruction, condensedInput } from "./condense.js";

const CONDENSE_MIN_TOKENS = 2000; // an agent with fewer tokens than this left does not condense

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const textOf = (content) => content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

function searchOutput(content) {
  if (!Array.isArray(content)) return `Search error: ${content?.error_code ?? "unknown"}`;
  return content.map((r) => `${r.title ?? ""} - ${r.url ?? ""}`.trim()).join("\n");
}

// A run record keeps everything the provider returned, so nothing has to be asked for again.
// A copy is taken so later changes to the conversation cannot reach an event already sent.
const copy = (value) => structuredClone(value);

export function createAgent({ node, design = null, call, emit, budget: runBudget, signal, language = "en", sleep = defaultSleep, provider = "anthropic", cached = [], maxOutputTokens = OUTPUT_TOKENS.default, retries = RETRIES.default, retryDelaySec = RETRY_DELAY_SEC.default, freeTier = false, repeatStop = REPEAT_STOP.default, fallback = "off", askFirst = false, notebook = null, task = null }) {
  const retryLimit = clampRetries(retries);
  const retryDelayMs = clampRetryDelaySec(retryDelaySec) * 1000;
  // The agent counts against its own limits too (node.limits); the limits of the run still apply.
  const budget = runBudget.forAgent ? runBudget.forAgent(node.limits) : runBudget;
  const onLimit = node.onLimit === "pass" ? "pass" : "stop";
  const outputCap = Math.min(clampOutputTokens(maxOutputTokens), node.limits?.maxOutputTokens ?? Infinity);
  // Answers from an earlier try of the run: used up first, in order, before the provider is called again.
  const answers = [...cached];
  const model = nodeModel(node, provider).id;
  // The shared notebook: what this agent may do with it (nothing unless the run has it switched on).
  const book = notebook ? notebookRole(node, design) : { on: false, read: false, write: false };
  const memory = book.on ? book : undefined;
  const ownSystem = systemPromptFor(node, { language, pattern: design?.pattern, memory });
  // Self-critique: the same agent is asked to judge its own draft (run(input, { as: "evaluator" })), with the evaluator role.
  const judgeSystem = systemPromptFor({ ...node, agent: "evaluator" }, { language, pattern: design?.pattern, memory });
  let system = ownSystem;
  const label = agentLabel(node, design, AGENT_TYPES[node.agent]?.label ?? node.agent);
  const limitValue = { agent_steps: node.limits?.maxSteps, agent_tokens: node.limits?.maxTokens, agent_searches: node.limits?.maxSearches };
  const stopRun = (reason) => new LimitError(`agent_${reason}`, { agent: node.id, label, value: limitValue[`agent_${reason}`] });
  const repeatLimit = clampRepeatStop(repeatStop);
  const same = (text) => String(text ?? "").toLowerCase().replace(/\s+/g, " ").trim();
  let lastSame = null;
  let sameInARow = 0;
  // After an answer: the run stops when this agent has given the same answer repeatLimit times in a row.
  const checkRepeat = (text) => {
    const now = same(text);
    sameInARow = now !== "" && now === lastSame ? sameInARow + 1 : 1;
    lastSame = now;
    if (repeatLimit > 0 && now !== "" && sameInARow >= repeatLimit) throw new LimitError("repeat", { agent: node.id, label, value: sameInARow });
  };
  // The notes in a reply go to the notebook and out of the text that goes on. `silent`: the reply comes from an earlier try
  // of the run, whose note events already exist.
  const takeNotes = (reply, silent = false) => {
    if (!book.write) return reply;
    const { text, notes } = extractNotes(reply);
    for (const note of notes) notebook.add(node.id, note, { silent });
    return text;
  };
  // Condensing: the material of an input is shortened by one extra call, only when the node asks for it.
  const condenses = node.condense === true && mayCondense(node.agent, design?.pattern) && typeof task === "string";
  // After the fallback switch the agent runs on another model; the cost follows it.
  let active = nodeModel(node, provider);
  const costOf = (usage) => usageCostUsd(usage, { ...node, model: active.key }, { provider, freeTier });
  const messages = [];
  let lastRequest = null;
  let sent = 0; // how many messages earlier requests already carried
  let round = 0;

  async function request(custom = null) {
    budget.chargeStep();
    if (custom) return call(custom, { signal });
    const tools = toolsFor(node, budget);
    const body = {
      model: active.id,
      max_tokens: Math.max(1, Math.min(outputCap, budget.remainingTokens())),
      system,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    };
    lastRequest = { model: body.model, max_tokens: body.max_tokens, tools: copy(body.tools ?? []), messageCount: body.messages.length };
    return call(body, { signal });
  }

  async function requestWithRetry(custom = null) {
    let switched = false;
    for (let tried = 0; ; tried++) {
      try {
        return await request(custom);
      } catch (error) {
        if (!(error instanceof AnthropicError) || !error.retryable) throw error;
        if (tried >= retryLimit) {
          // Out of tries. With the automatic fallback, one more try with another model of the same provider.
          const next = !switched && !custom && fallback === "auto" ? fallbackModelFor(node, provider, freeTier) : null;
          if (!next) throw error;
          switched = true;
          emit({ type: "warning", agent: node.id, fallback: { from: active.id, to: next.id }, message: `The provider stayed busy (${redact(error.message.split("\n\n").at(-1))}). Trying once more with ${next.label} (${next.id}) instead of ${active.label} (${active.id}).` });
          active = next;
          await sleep(retryDelayMs);
          tried = retryLimit - 1; // the loop adds one: this is the last try
          continue;
        }
        const left = retryLimit - tried;
        emit({ type: "warning", agent: node.id, retry: true, message: `The provider was busy (${redact(error.message.split("\n\n").at(-1))}). Trying again (${left === 1 ? "last try" : `${left} tries left`}).` });
        await sleep(retryDelayMs);
      }
    }
  }

  const fastNode = { ...node, model: "fast" };
  const condenseCost = (usage) => usageCostUsd(usage, { ...node, model: nodeModel(fastNode, provider).key }, { provider, freeTier });

  // An earlier condensing (recorded in the run that is carried on): charged again so the limits stay honest, nothing is called or sent.
  function replayCondense(plainInput, recorded) {
    const split = recorded && condenses ? splitInput(plainInput, task) : null;
    if (!split) return plainInput;
    const usage = { input: Number(recorded.usage?.input) || 0, output: Number(recorded.usage?.output) || 0 };
    try {
      budget.chargeStep();
      budget.chargeUsage({ ...usage, searches: 0, cost: condenseCost(usage) });
    } catch (error) {
      if (!(error instanceof AgentLimitError)) throw error;
      if (onLimit === "stop") throw stopRun(error.reason);
    }
    return recorded.kept === false || typeof recorded.text !== "string" ? plainInput : condensedInput(split.head, recorded.text, split.tail);
  }

  // The extra call that shortens the material of an input. Returns the input the agent gets: the shortened one, or the one it was given
  // when the call is skipped, fails or does not give a shorter text. The call is a step of this agent, so it needs two steps and some
  // tokens left, else it is skipped and the agent keeps them for its own work.
  async function condense(split, plainInput) {
    if (budget.remainingSteps() < 2 || budget.remainingTokens() < CONDENSE_MIN_TOKENS) {
      emit({ type: "warning", agent: node.id, condense: "skipped", message: "The input was not condensed: this agent has too few steps or tokens left for the extra call." });
      return plainInput;
    }
    const fast = nodeModel(fastNode, provider);
    const body = { model: fast.id, max_tokens: Math.max(1, Math.min(600, budget.remainingTokens())), system: condenseInstruction(language), messages: [{ role: "user", content: split.material }] };
    let response;
    try {
      response = await requestWithRetry(body);
    } catch (error) {
      if (error instanceof AgentLimitError) {
        if (onLimit === "stop") throw stopRun(error.reason);
        return plainInput;
      }
      // A busy or failing provider does not fail the run for this: the agent reads the full text.
      if (error instanceof AnthropicError && !signal?.aborted) {
        emit({ type: "warning", agent: node.id, condense: "failed", message: `The input was not condensed (${redact(String(error.message).split("\n\n").at(-1))}). The agent reads the full text.` });
        return plainInput;
      }
      throw error;
    }
    const summary = textOf(response.content ?? []);
    const usage = { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 };
    const kept = summary !== "" && summary.length < split.material.length;
    // Recorded before it is charged, like a round: a limit hit by this call still leaves the record of what was spent.
    emit({ type: "condense", agent: node.id, from: split.material.length, to: summary.length, text: summary, material: split.material, usage, model: fast.id, kept });
    try {
      budget.chargeUsage({ ...usage, searches: 0, cost: condenseCost(usage) });
    } catch (error) {
      if (!(error instanceof AgentLimitError)) throw error;
      if (onLimit === "stop") throw stopRun(error.reason);
    }
    return kept ? condensedInput(split.head, summary, split.tail) : plainInput;
  }

  return {
    id: node.id,
    async run(plainInput, { as } = {}) {
      const judging = as === "evaluator";
      system = judging ? judgeSystem : ownSystem;
      // An agent that reads gets the notes written so far at the end of its input.
      const inputFor = (mode, base = plainInput) => (book.read ? `${base}${notebook.forReader({ mode })}` : base);
      // A recorded condensing with no answer after it: the agent failed after condensing, so it is not called again.
      const pendingCondense = answers[0]?.pending === true ? answers.shift().condense : null;
      const earlier = pendingCondense ? undefined : answers.shift();
      if (earlier) {
        // One turn of the event loop, as a real call takes: agents that start together read the notebook before any of them writes to it.
        await Promise.resolve();
        const input = inputFor("replay", replayCondense(plainInput, earlier.condense));
        // Nothing is sent or emitted: the caller already holds this agent's events. The agent just remembers the exchange.
        try {
          budget.chargeStep();
          budget.chargeUsage({ input: earlier.tokens?.input, output: earlier.tokens?.output, cost: costOf({ input: earlier.tokens?.input, output: earlier.tokens?.output }) });
        } catch (error) {
          // The answer is already there; with pass it is kept, with stop the run ends as it would have the first time.
          if (!(error instanceof AgentLimitError)) throw error;
          if (onLimit === "stop") throw stopRun(error.reason);
        }
        messages.push({ role: "user", content: input }, { role: "assistant", content: [{ type: "text", text: earlier.text }] });
        sent = messages.length;
        return { text: takeNotes(earlier.text, true), usage: { input: Number(earlier.tokens?.input) || 0, output: Number(earlier.tokens?.output) || 0, searches: 0 } };
      }
      // Marked for human approval and not approved yet: say what the agent would receive, and end the run here.
      if (askFirst) {
        const input = inputFor("peek");
        emit({ type: "approval", agent: node.id, role: label, input: String(input).slice(0, APPROVAL_INPUT_MAX), inputChars: String(input).length });
        throw new ApprovalPause(node.id);
      }
      emit({
        type: "agent_start",
        agent: node.id,
        role: label,
        model,
        tools: toolsFor(node, budget).map((tool) => tool.name),
        system,
        ...(judging ? { judging: true } : {}),
      });
      const split = condenses ? splitInput(plainInput, task) : null;
      const base = pendingCondense ? replayCondense(plainInput, pendingCondense) : split ? await condense(split, plainInput) : plainInput;
      const input = inputFor("live", base);
      messages.push({ role: "user", content: input });
      const total = { input: 0, output: 0, searches: 0 };
      const texts = [];
      let pauses = 0;
      // The agent reached a limit of its own. Stop: the run ends. Pass: what it wrote goes on, and the run carries on.
      const endAtLimit = (reason) => {
        // In a handoff, router or voting run (the tally) the reply is the decision, so a cut-off reply cannot be passed on: a limit of the agent always stops the run.
        if (onLimit === "stop" || design?.pattern === "handoff" || node.agent === "router" || node.agent === "tally" || node.agent === "splitter" || (node.agent === "planner" && design?.pattern === "planexec")) throw stopRun(reason);
        const written = texts.filter(Boolean).join("\n").trim();
        if (written === "") throw new Error(`The agent ${label} reached its own limit (${reason}) before it wrote anything. Raise the limit of this agent in the editor, and run again.`);
        emit({ type: "warning", agent: node.id, limit: `agent_${reason}`, message: agentPassMessage(`agent_${reason}`, { label, value: limitValue[`agent_${reason}`] }) });
        emit({ type: "agent_output", agent: node.id, text: written, tokens: { input: total.input, output: total.output } });
        return { text: takeNotes(written), usage: total };
      };
      for (;;) {
        const fresh = copy(messages.slice(sent));
        sent = messages.length;
        const startedAt = Date.now();
        let response;
        try {
          response = await requestWithRetry();
        } catch (error) {
          if (!(error instanceof AgentLimitError)) throw error;
          return endAtLimit(error.reason);
        }
        round += 1;
        emit({
          type: "round",
          agent: node.id,
          round,
          ms: Date.now() - startedAt,
          stop: response.stop_reason,
          usage: { input: response.usage?.input_tokens ?? 0, output: response.usage?.output_tokens ?? 0 },
          newMessages: fresh,
          content: copy(response.content ?? []),
          raw: {
            request: lastRequest,
            response: {
              id: response.id ?? null,
              type: response.type ?? null,
              role: response.role ?? null,
              model: response.model ?? null,
              stop_reason: response.stop_reason ?? null,
              stop_sequence: response.stop_sequence ?? null,
              usage: copy(response.usage ?? {}),
            },
            http: response._meta ? copy(response._meta) : null,
          },
        });
        for (const block of response.content ?? []) {
          if (block.type === "server_tool_use") {
            const query = block.input?.query;
            emit({ type: "tool_call", agent: node.id, tool: block.name, input: typeof query === "string" ? query : JSON.stringify(block.input ?? {}) });
          } else if (block.type === "web_search_tool_result") {
            emit({ type: "tool_result", agent: node.id, tool: "web_search", output: searchOutput(block.content) });
          }
        }
        const usage = response.usage ?? {};
        const charge = {
          input: usage.input_tokens,
          output: usage.output_tokens,
          searches: usage.server_tool_use?.web_search_requests,
        };
        total.input += charge.input || 0;
        total.output += charge.output || 0;
        total.searches += charge.searches || 0;
        messages.push({ role: "assistant", content: response.content ?? [] });
        texts.push(textOf(response.content ?? []));
        try {
          budget.chargeUsage({ ...charge, cost: costOf(charge) });
        } catch (error) {
          if (!(error instanceof AgentLimitError)) throw error;
          return endAtLimit(error.reason);
        }
        if (response.stop_reason === "pause_turn") {
          pauses += 1;
          if (pauses > MAX_PAUSES) throw new Error("The model kept pausing the turn");
          continue;
        }
        if (response.stop_reason === "max_tokens") {
          emit({ type: "warning", agent: node.id, truncated: true, message: "The answer was cut because it reached the token limit for one reply." });
        }
        break;
      }
      const text = texts.filter(Boolean).join("\n").trim();
      emit({ type: "agent_output", agent: node.id, text, tokens: { input: total.input, output: total.output } });
      const passed = takeNotes(text);
      checkRepeat(passed);
      return { text: passed, usage: total };
    },
  };
}
