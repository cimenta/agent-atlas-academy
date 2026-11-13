// The only place that talks to Google Gemini. It takes the same request the Anthropic call takes and
// returns the same shape of answer, so the agents, the runners and the replay do not know the difference.
import { AnthropicError, redact } from "./anthropic.js";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const textOfContent = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((b) => b?.type === "text").map((b) => b.text).join("\n");
};

// Anthropic-shaped body -> Gemini generateContent body.
export function toGeminiRequest(body) {
  const contents = [];
  for (const message of body.messages ?? []) {
    const text = textOfContent(message.content);
    contents.push({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: text === "" ? "(no text)" : text }] });
  }
  const request = {
    contents,
    generationConfig: { maxOutputTokens: Math.max(1, Number(body.max_tokens) || 1) },
  };
  if (typeof body.system === "string" && body.system !== "") request.systemInstruction = { parts: [{ text: body.system }] };
  if (Array.isArray(body.tools) && body.tools.length > 0) request.tools = [{ google_search: {} }];
  return request;
}

// Gemini answer -> Anthropic-shaped answer (content blocks, stop_reason, usage).
export function fromGeminiResponse(data) {
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const reason = data?.promptFeedback?.blockReason;
    throw new AnthropicError(reason ? `Google did not answer: the request was blocked (${reason})` : "Google returned no answer");
  }
  const text = (candidate.content?.parts ?? []).map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
  const grounding = candidate.groundingMetadata;
  const queries = Array.isArray(grounding?.webSearchQueries) ? grounding.webSearchQueries : [];
  const content = [];
  for (const query of queries) content.push({ type: "server_tool_use", name: "web_search", input: { query } });
  if (queries.length > 0) {
    const results = (grounding.groundingChunks ?? []).map((c) => ({ title: c?.web?.title ?? "", url: c?.web?.uri ?? "" })).filter((r) => r.url !== "");
    content.push({ type: "web_search_tool_result", content: results });
  }
  content.push({ type: "text", text });
  const usageMetadata = data.usageMetadata ?? {};
  const usage = {
    input_tokens: Number(usageMetadata.promptTokenCount) || 0,
    // Thinking tokens are billed as output.
    output_tokens: (Number(usageMetadata.candidatesTokenCount) || 0) + (Number(usageMetadata.thoughtsTokenCount) || 0),
  };
  if (queries.length > 0) usage.server_tool_use = { web_search_requests: queries.length };
  return { type: "message", role: "assistant", content, stop_reason: candidate.finishReason === "MAX_TOKENS" ? "max_tokens" : "end_turn", usage };
}

export async function callGemini(body, { apiKey, fetchImpl = fetch, signal, timeoutMs = 60000 } = {}) {
  if (typeof apiKey !== "string" || apiKey.length === 0) throw new AnthropicError("No API key was given");
  if (signal?.aborted) throw new AnthropicError("The request was cancelled");
  const timeout = AbortSignal.timeout(timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const url = `${API_ROOT}/${encodeURIComponent(body.model)}:generateContent`;

  let response;
  const startedAt = Date.now();
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(toGeminiRequest(body)),
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
    let message = redact(data?.error?.message, apiKey) || `Google answered with status ${response.status}`;
    // On the free tier the quota of Google Search grounding can be zero, which looks like a plain quota error.
    if (response.status === 429 && /quota/i.test(message) && Array.isArray(body.tools) && body.tools.length > 0) message += " (This agent uses web search; on the free tier its quota may be zero. Turn web search off and try again.)";
    throw new AnthropicError(message, { status: response.status, retryable: RETRYABLE_STATUS.has(response.status) });
  }
  const answer = fromGeminiResponse(data);
  answer.model = body.model;
  Object.defineProperty(answer, "_meta", {
    value: { status: response.status, requestId: null, headers: {}, ms: Date.now() - startedAt },
    enumerable: false,
  });
  return answer;
}
