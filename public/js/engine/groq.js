// The only place that names Groq's addresses. The conversion is the shared chat-completions adapter.
import { callChatCompletions, listChatModels } from "./openai-compat.js";

const ROOT = "https://api.groq.com/openai/v1";

export const callGroq = (body, options = {}) => callChatCompletions(body, { ...options, url: `${ROOT}/chat/completions`, who: "Groq" });
export const listGroqModels = (options = {}) => listChatModels({ ...options, url: `${ROOT}/models`, who: "Groq" });
