// The only place that talks to Google Gemini. It takes the same request the Anthropic call takes and
// returns the same shape of answer, so the agents, the runners and the replay do not know the difference.
import { AnthropicError, redact, getJson } from "./anthropic.js";

const API_ROOT = "https://generativelanguage.googleapis.com/v1beta/models";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

const textOfContent = (content) => {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((b) => b?.type === "text").map((b) => b.text).join("\n");
};

// A JSON schema as Gemini wants it: the types in capitals, and no additionalProperties.
function toGeminiSchema(schema) {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (schema === null || typeof schema !== "object") return schema;
  const out = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    // The names under properties are field names, not schema words: only their values are schemas.
    if (key === "properties" && value !== null && typeof value === "object") {
      out.properties = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, toGeminiSchema(sub)]));
      continue;
    }
    if (key === "type" && typeof value === "string") out.type = value.toUpperCase();
    else if (key === "enum" || key === "required") out[key] = value;
    else out[key] = toGeminiSchema(value);
  }
  return out;
}

// Anthropic-shaped body -> Gemini generateContent body.
export function toGeminiRequest(body) {
  const contents = [];
  const toolNames = new Map(); // the id of a call for a tool to its name: a result must say which function it answers
  for (const message of body.messages ?? []) {
    const blocks = Array.isArray(message.content) ? message.content : [];
    const text = textOfContent(message.content);
    if (message.role === "assistant") {
      const parts = text === "" ? [] : [{ text }];
      for (const b of blocks) {
        if (b?.type !== "tool_use") continue;
        toolNames.set(b.id, b.name);
        // The signature of a thought belongs to the call and must be sent back with it.
        parts.push({ functionCall: { name: b.name, args: b.input ?? {} }, ...(typeof b.thoughtSignature === "string" ? { thoughtSignature: b.thoughtSignature } : {}) });
      }
      contents.push({ role: "model", parts: parts.length === 0 ? [{ text: "(no text)" }] : parts });
      continue;
    }
    const results = blocks.filter((b) => b?.type === "tool_result").map((b) => ({ functionResponse: { name: toolNames.get(b.tool_use_id) ?? "tool", response: b.is_error === true ? { error: textOfContent(b.content) } : { result: textOfContent(b.content) } } }));
    const parts = [...results, ...(text === "" ? [] : [{ text }])];
    contents.push({ role: "user", parts: parts.length === 0 ? [{ text: "(no text)" }] : parts });
  }
  const request = {
    contents,
    generationConfig: { maxOutputTokens: Math.max(1, Number(body.max_tokens) || 1) },
  };
  if (body.replySchema) {
    request.generationConfig.responseMimeType = "application/json";
    request.generationConfig.responseSchema = toGeminiSchema(body.replySchema);
  }
  if (typeof body.system === "string" && body.system !== "") request.systemInstruction = { parts: [{ text: body.system }] };
  const tools = Array.isArray(body.tools) ? body.tools : [];
  const own = tools.filter((tool) => tool?.input_schema);
  // The search of Gemini and functions do not go in one request: when there are functions, they are sent.
  if (own.length > 0) request.tools = [{ functionDeclarations: own.map((tool) => ({ name: tool.name, description: tool.description, parameters: toGeminiSchema(tool.input_schema) })) }];
  else if (tools.length > 0) request.tools = [{ google_search: {} }];
  return request;
}

// Gemini answer -> Anthropic-shaped answer (content blocks, stop_reason, usage).
export function fromGeminiResponse(data) {
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const reason = data?.promptFeedback?.blockReason;
    throw new AnthropicError(reason ? `Google did not answer: the request was blocked (${reason})` : "Google returned no answer");
  }
  const parts = candidate.content?.parts ?? [];
  const text = parts.map((p) => (typeof p?.text === "string" ? p.text : "")).join("");
  const calls = parts.filter((p) => p?.functionCall && typeof p.functionCall.name === "string");
  const grounding = candidate.groundingMetadata;
  const queries = Array.isArray(grounding?.webSearchQueries) ? grounding.webSearchQueries : [];
  const content = [];
  for (const query of queries) content.push({ type: "server_tool_use", name: "web_search", input: { query } });
  if (queries.length > 0) {
    const results = (grounding.groundingChunks ?? []).map((c) => ({ title: c?.web?.title ?? "", url: c?.web?.uri ?? "" })).filter((r) => r.url !== "");
    content.push({ type: "web_search_tool_result", content: results });
  }
  content.push({ type: "text", text });
  calls.forEach((p, i) => content.push({ type: "tool_use", id: `call_${i + 1}`, name: p.functionCall.name, input: p.functionCall.args ?? {}, ...(typeof p.thoughtSignature === "string" ? { thoughtSignature: p.thoughtSignature } : {}) }));
  const usageMetadata = data.usageMetadata ?? {};
  const usage = {
    input_tokens: Number(usageMetadata.promptTokenCount) || 0,
    // Thinking tokens are billed as output.
    output_tokens: (Number(usageMetadata.candidatesTokenCount) || 0) + (Number(usageMetadata.thoughtsTokenCount) || 0),
  };
  if (queries.length > 0) usage.server_tool_use = { web_search_requests: queries.length };
  return { type: "message", role: "assistant", content, stop_reason: candidate.finishReason === "MAX_TOKENS" ? "max_tokens" : calls.length > 0 ? "tool_use" : "end_turn", usage };
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
    if (timeout.aborted) throw new AnthropicError(`Timeout: Google did not answer within ${Math.round(timeoutMs / 1000)} seconds.\n\nThe model may be busy. Press Retry, or pick another model with the arrow next to Retry.`);
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
    if (response.status === 429 && /quota/i.test(message) && Array.isArray(body.tools) && body.tools.length > 0) message = `This agent uses web search. On the free tier its quota may be zero: turn web search off for this agent and try again.\n\n${message}`;
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

// The names of the models Google offers to this key (at most 5 pages of 1000).
// The whole list may take totalMs at most (default 20 s, under the 30 s limit of the function), however many pages there are.
export async function listGeminiModels({ apiKey, fetchImpl, signal, timeoutMs, totalMs = 20000 } = {}) {
  const names = [];
  const deadline = Date.now() + totalMs;
  let token = "";
  for (let page = 0; page < 5; page++) {
    if (page > 0 && Date.now() >= deadline) break;
    const url = `${API_ROOT}?pageSize=1000${token ? `&pageToken=${encodeURIComponent(token)}` : ""}`;
    const data = await getJson(url, { headers: { "x-goog-api-key": apiKey }, apiKey, fetchImpl, signal, timeoutMs, who: "Google" });
    if (Array.isArray(data?.models)) names.push(...data.models.map((m) => m?.name));
    token = typeof data?.nextPageToken === "string" ? data.nextPageToken : "";
    if (!token) break;
  }
  return names;
}
