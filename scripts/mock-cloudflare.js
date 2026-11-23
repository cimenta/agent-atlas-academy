// The local stand-in for Cloudflare Workers AI (mock mode only, never on Vercel): the chat-completions address and the list of models.
// MOCK_CF_429=quota makes every third call answer that the daily free allocation of neurons is used up (HTTP 400, code 4006, as the
// owner's test is expected to show; the real answer is not in Cloudflare's pages).
import { PROVIDERS } from "../public/js/engine/providers.js";

export function createCloudflareMock({ mockCall, mode = process.env.MOCK_CF_429 ?? "" } = {}) {
  let calls = 0;
  return async function answer(chat, { signal } = {}) {
    calls += 1;
    if (mode === "quota" && calls % 3 === 0) {
      return { status: 400, headers: {}, body: { success: false, result: null, errors: [{ code: 4006, message: "you have used up your daily free allocation of 10,000 neurons. Please upgrade to Cloudflare's Workers Paid plan." }], messages: [] } };
    }
    const system = chat.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
    const messages = chat.messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, content: String(m.content ?? "") }));
    const request = { model: chat.model, max_tokens: chat.max_completion_tokens ?? chat.max_tokens, system, messages };
    if (chat.response_format?.json_schema?.schema) request.replySchema = chat.response_format.json_schema.schema;
    const made = await mockCall(request, { signal });
    const text = (made.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
    const promptChars = system.length + messages.reduce((n, m) => n + m.content.length, 0);
    return {
      status: 200,
      headers: { "cf-ray": "mock-ray" },
      body: { id: "chatcmpl-mock", object: "chat.completion", model: chat.model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: { prompt_tokens: Math.ceil(promptChars / 4), completion_tokens: Math.ceil(text.length / 4), total_tokens: Math.ceil((promptChars + text.length) / 4), neurons: Math.round((Math.ceil(promptChars / 4) * 0.0409 + Math.ceil(text.length / 4) * 0.2909) * 10) / 10 } },
    };
  };
}

// The models as the models route reads them: the ids of the registry, then two made-up ones.
export function mockCloudflareList() {
  return [...PROVIDERS.cloudflare.models.map((m) => m.id), "@cf/mock/alpha-8b-instruct", "@cf/mock/beta-70b-instruct"];
}
