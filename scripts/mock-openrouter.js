// The local stand-in for OpenRouter (mock mode only, never on Vercel): the chat-completions address and the list of models.
// MOCK_OR_429=minute|day makes every third call answer 429 (a minute limit with retry-after 30, or the day limit of the free models).
// MOCK_OR_429=gone hides one free model of the registry from the list, so the check of the free models has something to repair.
import { PROVIDERS } from "../public/js/engine/providers.js";

export function createOpenrouterMock({ mockCall, mode = process.env.MOCK_OR_429 ?? "" } = {}) {
  let calls = 0;
  return async function answer(chat, { signal } = {}) {
    calls += 1;
    if ((mode === "minute" || mode === "day") && calls % 3 === 0) {
      if (mode === "minute") return { status: 429, headers: { "retry-after": "30" }, body: { error: { message: "Rate limit exceeded: free-models-per-min. Please retry in 30 seconds.", code: 429 } } };
      return { status: 429, headers: { "retry-after": "21600" }, body: { error: { message: "Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day.", code: 429 } } };
    }
    const system = chat.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const messages = chat.messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: String(m.content ?? "") }));
    const request = { model: chat.model, max_tokens: chat.max_tokens ?? chat.max_completion_tokens, system, messages };
    if (chat.response_format?.json_schema?.schema) request.replySchema = chat.response_format.json_schema.schema;
    const made = await mockCall(request, { signal });
    const text = (made.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const promptChars = system.length + messages.reduce((n, m) => n + m.content.length, 0);
    return {
      status: 200,
      headers: { "x-request-id": "req_mock_openrouter" },
      body: { id: "gen-mock", object: "chat.completion", model: chat.model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: { prompt_tokens: Math.ceil(promptChars / 4), completion_tokens: Math.ceil(text.length / 4), total_tokens: Math.ceil((promptChars + text.length) / 4) } },
    };
  };
}

// The public list as the models route reads it: { ids, models }. The registry ids come first, then made-up free models to pick from.
export function mockOpenrouterList({ mode = process.env.MOCK_OR_429 ?? "" } = {}) {
  const paid = PROVIDERS.openrouter.models.map((m) => m.id);
  const free = PROVIDERS.openrouter.models.map((m) => m.freeId).filter(Boolean);
  const kept = mode === "gone" ? free.slice(0, -1) : free;
  const extra = ["mock/alpha-8b-it:free", "mock/beta-70b-it:free"];
  const models = [...kept, ...extra].map((id) => ({ id, name: `Mock ${id.split("/")[1].replace(":free", "")}`, tools: true, forcedFormat: true }));
  return { ids: [...paid, ...kept, ...extra], models };
}
