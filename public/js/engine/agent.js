// One agent in a run: keeps its own conversation, calls the model, reports events.
import { MODELS, AGENT_TYPES } from "./catalog.js";
import { systemPromptFor } from "./prompts.js";
import { toolsFor } from "./tools.js";
import { AnthropicError, redact } from "./anthropic.js";

const MAX_OUTPUT_TOKENS = 4000;
const MAX_PAUSES = 4;
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

export function createAgent({ node, call, emit, budget, signal, language = "en", sleep = defaultSleep }) {
  const model = (MODELS.find((m) => m.key === node.model) ?? MODELS[0]).id;
  const system = systemPromptFor(node, { language });
  const label = node.agent === "free" && node.name ? node.name : (AGENT_TYPES[node.agent]?.label ?? node.agent);
  const messages = [];
  let lastRequest = null;
  let sent = 0; // how many messages earlier requests already carried
  let round = 0;

  async function request() {
    budget.chargeStep();
    const tools = toolsFor(node, budget);
    const body = {
      model,
      max_tokens: Math.max(1, Math.min(MAX_OUTPUT_TOKENS, budget.remainingTokens())),
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
      emit({ type: "warning", agent: node.id, message: `The provider was busy (${redact(error.message)}). Trying once more.` });
      await sleep(RETRY_DELAY_MS);
      return request();
    }
  }

  return {
    id: node.id,
    async run(input) {
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
      for (;;) {
        const fresh = copy(messages.slice(sent));
        sent = messages.length;
        const startedAt = Date.now();
        const response = await requestWithRetry();
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
        budget.chargeUsage(charge);
        texts.push(textOf(response.content ?? []));
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
