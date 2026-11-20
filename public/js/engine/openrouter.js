// The only place that names OpenRouter's addresses. The conversion is the shared chat-completions adapter.
// OpenRouter takes max_tokens, and the reasoning effort of Groq's models is not sent.
// forcedFormat: false leaves the reply format out for a model that cannot take it (the format repair of the engine covers that case).
import { callChatCompletions, listChatModels } from "./openai-compat.js";
import { getJson } from "./anthropic.js";

const ROOT = "https://openrouter.ai/api/v1";

export const callOpenrouter = (body, options = {}) => callChatCompletions(body, { ...options, url: `${ROOT}/chat/completions`, who: "OpenRouter", maxTokensField: "max_tokens", reasoningEffort: null });
// The list of models is public: a key is sent only when one is given.
export const listOpenrouterModels = (options = {}) => listChatModels({ ...options, url: `${ROOT}/models`, who: "OpenRouter" });

// The same list with what the free-model check needs: { ids, models: [{ id, name, tools, forcedFormat }] }. The list is foreign data:
// the server cleans it (engine/model-check.js) before anything leaves it.
export async function listOpenrouterDetailed({ apiKey, fetchImpl, signal, timeoutMs } = {}) {
  const keyed = typeof apiKey === "string" && apiKey !== "";
  const data = await getJson(`${ROOT}/models`, { headers: keyed ? { authorization: `Bearer ${apiKey}` } : {}, apiKey, noKey: !keyed, fetchImpl, signal, timeoutMs, who: "OpenRouter" });
  const rows = Array.isArray(data?.data) ? data.data : [];
  const takes = (row, name) => Array.isArray(row?.supported_parameters) && row.supported_parameters.includes(name);
  return {
    ids: rows.map((row) => row?.id),
    models: rows.map((row) => ({ id: row?.id, name: row?.name, tools: takes(row, "tools"), forcedFormat: takes(row, "response_format") || takes(row, "structured_outputs") })),
  };
}
