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

export function createAgent({ node, call, emit, budget, signal, language = "en", sleep = defaultSleep }) {
  const model = (MODELS.find((m) => m.key === node.model) ?? MODELS[0]).id;
  const system = systemPromptFor(node, { language });
  const label = node.agent === "free" && node.name ? node.name : (AGENT_TYPES[node.agent]?.label ?? node.agent);
  const messages = [];

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
      emit({ type: "agent_start", agent: node.id, role: label });
      messages.push({ role: "user", content: input });
      const total = { input: 0, output: 0, searches: 0 };
      const texts = [];
      let pauses = 0;
      for (;;) {
        const response = await requestWithRetry();
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
