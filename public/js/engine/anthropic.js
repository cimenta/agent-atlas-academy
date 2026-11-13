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
      body: JSON.stringify(body),
      signal: combined,
    });
  } catch (error) {
    if (signal?.aborted) throw new AnthropicError("The request was cancelled");
    if (timeout.aborted) throw new AnthropicError(`The request timed out after ${timeoutMs} ms`);
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
