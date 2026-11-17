// One agent in a run: keeps its own conversation, calls the model, reports events.
import { nodeModel, AGENT_TYPES, OUTPUT_TOKENS, MAX_PAUSES, clampOutputTokens } from "./catalog.js";
import { systemPromptFor } from "./prompts.js";
import { toolsFor } from "./tools.js";
import { AnthropicError, redact } from "./anthropic.js";
import { agentLabel } from "./labels.js";
import { AgentLimitError, LimitError } from "./budget.js";
import { agentPassMessage } from "./harness.js";

const RETRY_DELAY_MS = 1500;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const textOf = (content) => content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

function searchOutput(content) {
  if (!Array.isArray(content)) return `Search error: ${content?.error_code ?? "unknown"}`;
  return content.map((r) => `${r.title ?? ""} - ${r.url ?? ""}`.trim()).join("\n");
}

// A run record keeps everything the provider returned, so nothing has to be asked for again.
// A copy is taken so later changes to the conversation cannot reach an event already sent.
const copy = (value) => structuredClone(value);

export function createAgent({ node, design = null, call, emit, budget: runBudget, signal, language = "en", sleep = defaultSleep, provider = "anthropic", cached = [], maxOutputTokens = OUTPUT_TOKENS.default }) {
  // The agent counts against its own limits too (node.limits); the limits of the run still apply.
  const budget = runBudget.forAgent ? runBudget.forAgent(node.limits) : runBudget;
  const onLimit = node.onLimit === "pass" ? "pass" : "stop";
  const outputCap = Math.min(clampOutputTokens(maxOutputTokens), node.limits?.maxOutputTokens ?? Infinity);
  // Answers from an earlier try of the run: used up first, in order, before the provider is called again.
  const answers = [...cached];
  const model = nodeModel(node, provider).id;
  const system = systemPromptFor(node, { language });
  const label = agentLabel(node, design, AGENT_TYPES[node.agent]?.label ?? node.agent);
  const limitValue = { agent_steps: node.limits?.maxSteps, agent_tokens: node.limits?.maxTokens, agent_searches: node.limits?.maxSearches };
  const stopRun = (reason) => new LimitError(`agent_${reason}`, { agent: node.id, label, value: limitValue[`agent_${reason}`] });
  const messages = [];
  let lastRequest = null;
  let sent = 0; // how many messages earlier requests already carried
  let round = 0;

  async function request() {
    budget.chargeStep();
    const tools = toolsFor(node, budget);
    const body = {
      model,
      max_tokens: Math.max(1, Math.min(outputCap, budget.remainingTokens())),
      system,
      messages,
      ...(tools.length > 0 ? { tools } : {}),
    };
    lastRequest = { model: body.model, max_tokens: body.max_tokens, tools: copy(body.tools ?? []), messageCount: body.messages.length };
    return call(body, { signal });
  }

  async function requestWithRetry() {
    try {
      return await request();
    } catch (error) {
      if (!(error instanceof AnthropicError) || !error.retryable) throw error;
      emit({ type: "warning", agent: node.id, message: `The provider was busy (${redact(error.message.split("\n\n").at(-1))}). Trying once more.` });
      await sleep(RETRY_DELAY_MS);
      return request();
    }
  }

  return {
    id: node.id,
    async run(input) {
      const earlier = answers.shift();
      if (earlier) {
        // Nothing is sent or emitted: the caller already holds this agent's events. The agent just remembers the exchange.
        try {
          budget.chargeStep();
          budget.chargeUsage({ input: earlier.tokens?.input, output: earlier.tokens?.output });
        } catch (error) {
          // The answer is already there; with pass it is kept, with stop the run ends as it would have the first time.
          if (!(error instanceof AgentLimitError)) throw error;
          if (onLimit === "stop") throw stopRun(error.reason);
        }
        messages.push({ role: "user", content: input }, { role: "assistant", content: [{ type: "text", text: earlier.text }] });
        sent = messages.length;
        return { text: earlier.text, usage: { input: Number(earlier.tokens?.input) || 0, output: Number(earlier.tokens?.output) || 0, searches: 0 } };
      }
      emit({
        type: "agent_start",
        agent: node.id,
        role: label,
        model,
        tools: toolsFor(node, budget).map((tool) => tool.name),
        system,
      });
      messages.push({ role: "user", content: input });
      const total = { input: 0, output: 0, searches: 0 };
      const texts = [];
      let pauses = 0;
      // The agent reached a limit of its own. Stop: the run ends. Pass: what it wrote goes on, and the run carries on.
      const endAtLimit = (reason) => {
        if (onLimit === "stop") throw stopRun(reason);
        const written = texts.filter(Boolean).join("\n").trim();
        if (written === "") throw new Error(`The agent ${label} reached its own limit (${reason}) before it wrote anything. Raise the limit of this agent in the editor, and run again.`);
        emit({ type: "warning", agent: node.id, limit: `agent_${reason}`, message: agentPassMessage(`agent_${reason}`, { label, value: limitValue[`agent_${reason}`] }) });
        emit({ type: "agent_output", agent: node.id, text: written, tokens: { input: total.input, output: total.output } });
        return { text: written, usage: total };
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
          budget.chargeUsage(charge);
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
          emit({ type: "warning", agent: node.id, message: "The answer was cut because it reached the token limit for one reply." });
        }
        break;
      }
      const text = texts.filter(Boolean).join("\n").trim();
      emit({ type: "agent_output", agent: node.id, text, tokens: { input: total.input, output: total.output } });
      return { text, usage: total };
    },
  };
}
