// The shared adapter for providers that speak the chat-completions format (Groq and OpenRouter now; Cloudflare later).
// It takes the same Anthropic-shaped request the other adapters take and returns the same shape of answer, so the agents,
// the runners and the replay do not know the difference. The call takes `fetchImpl`, so the API log records it as for every provider.
import { AnthropicError, redact, getJson } from "./anthropic.js";

const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const textOfBlocks = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((b) => b?.type === "text").map((b) => b.text).join("\n");
};

// Anthropic-shaped body -> chat-completions body.
// forcedFormat: false leaves out the forced reply format. maxTokensField: the name of the size field. reasoningEffort: null leaves it out.
export function toChatRequest(body, { model = body.model, forcedFormat = true, maxTokensField = "max_completion_tokens", reasoningEffort = "low" } = {}) {
  const messages = [];
  if (typeof body.system === "string" && body.system !== "") messages.push({ role: "system", content: body.system });
  for (const message of body.messages ?? []) {
    const blocks = Array.isArray(message.content) ? message.content : [];
    if (message.role === "assistant") {
      const calls = blocks.filter((b) => b?.type === "tool_use").map((b) => ({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } }));
      const text = textOfBlocks(message.content);
      messages.push({ role: "assistant", content: text === "" && calls.length === 0 ? "(no text)" : text, ...(calls.length > 0 ? { tool_calls: calls } : {}) });
      continue;
    }
    for (const b of blocks) {
      if (b?.type === "tool_result") messages.push({ role: "tool", tool_call_id: b.tool_use_id, content: typeof b.content === "string" ? b.content : textOfBlocks(b.content) });
    }
    const text = textOfBlocks(message.content);
    if (text !== "" || !blocks.some((b) => b?.type === "tool_result")) messages.push({ role: "user", content: text === "" ? "(no text)" : text });
  }
  const request = { model, [maxTokensField]: Math.max(1, Number(body.max_tokens) || 1), ...(reasoningEffort === null ? {} : { reasoning_effort: reasoningEffort }), messages };
  const tools = Array.isArray(body.tools) ? body.tools : [];
  if (tools.length > 0) request.tools = tools.map((tool) => ({ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.input_schema } }));
  // A forced format cannot be combined with tools: the format repair of the engine covers that case.
  if (body.replySchema && tools.length === 0 && forcedFormat !== false) request.response_format = { type: "json_schema", json_schema: { name: "reply", strict: false, schema: body.replySchema } };
  return request;
}

const STOP = { stop: "end_turn", length: "max_tokens", tool_calls: "tool_use" };
const guessTokens = (text) => Math.ceil(String(text ?? "").length / 4);

// Chat-completions answer -> Anthropic-shaped answer (content blocks, stop_reason, usage).
// requestText: what was sent, used to estimate the input when the answer does not say how many tokens it was.
export function fromChatResponse(data, { who = "The provider", requestText = "" } = {}) {
  const choice = data?.choices?.[0];
  if (!choice) throw new AnthropicError(`${who} returned no answer`);
  const message = choice.message ?? {};
  const content = [];
  if (typeof message.content === "string" && message.content !== "") content.push({ type: "text", text: message.content });
  for (const call of Array.isArray(message.tool_calls) ? message.tool_calls : []) {
    let input = {};
    try {
      const parsed = JSON.parse(call?.function?.arguments);
      if (parsed !== null && typeof parsed === "object") input = parsed;
    } catch {
      // a broken argument text becomes an empty input
    }
    content.push({ type: "tool_use", id: call?.id ?? "", name: call?.function?.name ?? "", input });
  }
  if (content.length === 0) content.push({ type: "text", text: "" });
  const given = data?.usage ?? {};
  const outText = content.map((b) => (b.type === "text" ? b.text : JSON.stringify(b.input ?? {}))).join("");
  const inputKnown = Number.isFinite(given.prompt_tokens);
  const outputKnown = Number.isFinite(given.completion_tokens);
  const usage = { input_tokens: inputKnown ? given.prompt_tokens : guessTokens(requestText), output_tokens: outputKnown ? given.completion_tokens : guessTokens(outText) };
  if (!inputKnown || !outputKnown) usage.estimated = true;
  return { type: "message", role: "assistant", content, stop_reason: STOP[choice.finish_reason] ?? "end_turn", usage };
}

const KEPT_HEADERS = /^(x-request-id|retry-after|date|x-ratelimit-.*)$/i;

export async function callChatCompletions(body, { apiKey, fetchImpl = fetch, signal, timeoutMs = 60000, url, who = "The provider", forcedFormat, maxTokensField, reasoningEffort } = {}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) throw new AnthropicError("No API key was given");
  if (signal?.aborted) throw new AnthropicError("The request was cancelled");
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const requestText = JSON.stringify(toChatRequest(body, { forcedFormat, ...(maxTokensField ? { maxTokensField } : {}), ...(reasoningEffort === undefined ? {} : { reasoningEffort }) }));
  let response;
  const startedAt = Date.now();
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: requestText,
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw new AnthropicError("The request was cancelled");
    if (timeout.aborted) throw new AnthropicError(`Timeout: ${who} did not answer within ${Math.round(timeoutMs / 1000)} seconds.\n\nThe model may be busy. Press Retry, or pick another model with the arrow next to Retry.`);
    throw new AnthropicError(redact(error?.message, apiKey) || "Network error", { retryable: true });
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const message = redact(data?.error?.message ?? data?.errors?.[0]?.message, apiKey) || `${who} answered with status ${response.status}`;
    const error = new AnthropicError(message, { status: response.status, retryable: RETRYABLE_STATUS.has(response.status) });
    // The numeric code of the provider error (Cloudflare uses 4006 for a used-up allocation), so a caller need not search the message.
    const code = data?.errors?.[0]?.code ?? data?.error?.code;
    if (typeof code === "number") error.code = code;
    if (response.status === 429) {
      const asked = response.headers?.get?.("retry-after");
      const wait = asked === null || asked === undefined || asked === "" ? NaN : Number(asked);
      error.retryAfterSec = Number.isFinite(wait) && wait >= 0 ? wait : null;
      error.rateKind = /per[ -]day|\bTPD\b|\bRPD\b/i.test(message) ? "day" : "minute";
    }
    throw error;
  }
  const answer = fromChatResponse(data, { who, requestText });
  answer.model = body.model;
  const headers = {};
  try {
    for (const [name, value] of response.headers?.entries?.() ?? []) if (KEPT_HEADERS.test(name)) headers[name.toLowerCase()] = value;
  } catch {
    // headers are a bonus
  }
  Object.defineProperty(answer, "_meta", {
    value: { status: response.status, requestId: headers["x-request-id"] ?? null, headers, ms: Date.now() - startedAt },
    enumerable: false,
  });
  return answer;
}

// The ids of the models the provider offers to this key.
export async function listChatModels({ apiKey, fetchImpl, signal, timeoutMs, url, who } = {}) {
  const keyed = typeof apiKey === "string" && apiKey !== "";
  const data = await getJson(url, { headers: keyed ? { authorization: `Bearer ${apiKey}` } : {}, apiKey, noKey: !keyed, fetchImpl, signal, timeoutMs, who });
  return Array.isArray(data?.data) ? data.data.map((m) => m?.id) : [];
}
