// The only place that talks to Anthropic. Uses fetch and standard APIs only.

export class AnthropicError extends Error {
  constructor(message, { status = 0, retryable = false } = {}) {
    super(message);
    this.name = "AnthropicError";
    this.status = status;
    this.retryable = retryable;
  }
}

const API_URL = "https://api.anthropic.com/v1/messages";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529]);

// Removes the key, and anything shaped like an Anthropic key, from text that may be shown or logged.
export function redact(text, apiKey) {
  let out = String(text ?? "");
  if (typeof apiKey === "string" && apiKey.length >= 8) out = out.split(apiKey).join("[redacted]");
  return out.replace(/sk-ant-[A-Za-z0-9_-]+/g, "[redacted]").replace(/AIza[A-Za-z0-9_-]{20,}/g, "[redacted]").replace(/\bAQ\.[A-Za-z0-9_-]{20,}/g, "[redacted]");
}

// A request that asks for a reply in a shape (body.replySchema) is sent as a forced tool call: the model must "call" the tool
// reply, and the input it gives is the reply. The key replySchema never goes over the wire.
function wireBody(body) {
  if (!body.replySchema) return body;
  const { replySchema, ...rest } = body;
  const tools = [...(rest.tools ?? []), { name: "reply", description: "Give your reply in this shape.", input_schema: replySchema }];
  return { ...rest, tools, ...(tools.length === 1 ? { tool_choice: { type: "tool", name: "reply" } } : {}) };
}

// The answer to such a request: the input of the reply tool becomes the text of the reply, so nothing else has to know.
function textFromReplyTool(data) {
  if (!Array.isArray(data.content) || !data.content.some((b) => b?.type === "tool_use" && b.name === "reply")) return;
  data.content = data.content.map((b) => (b?.type === "tool_use" && b.name === "reply" ? { type: "text", text: JSON.stringify(b.input ?? {}) } : b));
  if (data.stop_reason === "tool_use") data.stop_reason = "end_turn";
}

export async function callAnthropic(body, { apiKey, fetchImpl = fetch, signal, timeoutMs = 60000 } = {}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) throw new AnthropicError("No API key was given");
  if (signal?.aborted) throw new AnthropicError("The request was cancelled");
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response;
  const startedAt = Date.now();
  try {
    response = await fetchImpl(API_URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(wireBody(body)),
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw new AnthropicError("The request was cancelled");
    if (timeout.aborted) throw new AnthropicError(`Timeout: Anthropic did not answer within ${Math.round(timeoutMs / 1000)} seconds.\n\nThe model may be busy. Press Retry, or pick another model with the arrow next to Retry.`);
    throw new AnthropicError(redact(error?.message, apiKey) || "Network error", { retryable: true });
  }

  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) {
    const message = redact(data?.error?.message, apiKey) || `Anthropic answered with status ${response.status}`;
    throw new AnthropicError(message, { status: response.status, retryable: RETRYABLE_STATUS.has(response.status) });
  }
  if (body.replySchema) textFromReplyTool(data);
  // The HTTP side of the answer travels with the data but stays out of it (not enumerable, so
  // it never changes what the caller compares or serialises by accident).
  const headers = {};
  const wanted = /^(request-id|retry-after|anthropic-ratelimit-.*|date)$/i;
  try {
    for (const [name, value] of response.headers?.entries?.() ?? []) if (wanted.test(name)) headers[name.toLowerCase()] = value;
  } catch {
    // headers are a bonus
  }
  Object.defineProperty(data, "_meta", {
    value: { status: response.status, requestId: headers["request-id"] ?? null, headers, ms: Date.now() - startedAt },
    enumerable: false,
  });
  return data;
}

// A GET that answers JSON, for the lists of models. Throws AnthropicError (with the status of a refusal), never with the key in it.
export async function getJson(url, { headers = {}, apiKey, fetchImpl = fetch, signal, timeoutMs = 20000, who = "The provider" } = {}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) throw new AnthropicError("No API key was given");
  if (signal?.aborted) throw new AnthropicError("The request was cancelled");
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let response;
  try {
    response = await fetchImpl(url, { method: "GET", headers, signal: combined });
  } catch (error) {
    if (signal?.aborted) throw new AnthropicError("The request was cancelled");
    if (timeout.aborted) throw new AnthropicError(`Timeout: ${who} did not answer within ${Math.round(timeoutMs / 1000)} seconds.`);
    throw new AnthropicError(redact(error?.message, apiKey) || "Network error", { retryable: true });
  }
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) throw new AnthropicError(redact(data?.error?.message, apiKey) || `${who} answered with status ${response.status}`, { status: response.status });
  return data;
}

// The ids of the models Anthropic offers to this key.
export async function listAnthropicModels({ apiKey, fetchImpl, signal, timeoutMs } = {}) {
  const data = await getJson("https://api.anthropic.com/v1/models?limit=1000", { headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, apiKey, fetchImpl, signal, timeoutMs, who: "Anthropic" });
  return Array.isArray(data?.data) ? data.data.map((m) => m?.id) : [];
}
