// The function that sends a request to each provider, by provider id (the ids of the registry, engine/providers.js).
// The options are the names the tests and the local mock server already use: call is Anthropic's, callGoogle is Gemini's, callGroq is Groq's.
import { callAnthropic } from "../public/js/engine/anthropic.js";
import { callGemini } from "../public/js/engine/gemini.js";
import { callGroq as callGroqDefault } from "../public/js/engine/groq.js";

export function providerCalls({ call = callAnthropic, callGoogle = callGemini, callGroq = callGroqDefault } = {}) {
  return { anthropic: call, google: callGoogle, groq: callGroq };
}
