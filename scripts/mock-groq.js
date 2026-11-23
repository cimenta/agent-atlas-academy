// The local stand-in for Groq's chat-completions address (mock mode only, never on Vercel).
// It turns a chat request back into the Messages shape, lets the mock agents answer, and wraps the answer as Groq would.
// MOCK_GROQ_429=minute makes every third call answer 429 with retry-after 23; =day makes every third call answer a day-limit 429.
export function createGroqMock({ mockCall, mode = process.env.MOCK_GROQ_429 ?? "" } = {}) {
  let calls = 0;
  return async function answer(chat, { signal } = {}) {
    calls += 1;
    if ((mode === "minute" || mode === "day") && calls % 3 === 0) {
      if (mode === "minute") {
        return { status: 429, headers: { "retry-after": "23", "x-ratelimit-limit-tokens": "8000", "x-ratelimit-remaining-tokens": "0", "x-ratelimit-reset-tokens": "23s" }, body: { error: { message: "Rate limit reached for model `openai/gpt-oss-20b` in organization `org_mock` service tier `on_demand` on tokens per minute (TPM): Limit 8000, Used 7600, Requested 1200. Please try again in 23s.", type: "tokens", code: "rate_limit_exceeded" } } };
      }
      return { status: 429, headers: { "retry-after": "21600", "x-ratelimit-limit-requests": "1000", "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "6h0m0s" }, body: { error: { message: "Rate limit reached for model `openai/gpt-oss-20b` in organization `org_mock` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199000, Requested 3000. Please try again in 6h0m0s.", type: "tokens", code: "rate_limit_exceeded" } } };
    }
    const system = chat.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const messages = chat.messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: String(m.content ?? "") }));
    const request = { model: chat.model, max_tokens: chat.max_completion_tokens, system, messages };
    if (chat.response_format?.json_schema?.schema) request.replySchema = chat.response_format.json_schema.schema;
    const made = await mockCall(request, { signal });
    const text = (made.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const promptChars = system.length + messages.reduce((n, m) => n + m.content.length, 0);
    return {
      status: 200,
      headers: { "x-request-id": "req_mock_groq", "x-ratelimit-limit-requests": "1000", "x-ratelimit-remaining-requests": "999", "x-ratelimit-limit-tokens": "8000", "x-ratelimit-remaining-tokens": "7000" },
      body: { id: "chatcmpl-mock", object: "chat.completion", model: chat.model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: { prompt_tokens: Math.ceil(promptChars / 4), completion_tokens: Math.ceil(text.length / 4), total_tokens: Math.ceil((promptChars + text.length) / 4) } },
    };
  };
}
