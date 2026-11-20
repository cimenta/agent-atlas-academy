// The function that sends a request to each provider, by provider id (the ids of the registry, engine/providers.js).
// The options are the names the tests and the local mock server already use: call is Anthropic's, callGoogle is Gemini's, callGroq is Groq's, callOpenrouter is OpenRouter's, callCloudflare is Cloudflare's.
import { callAnthropic } from "../public/js/engine/anthropic.js";
import { callGemini } from "../public/js/engine/gemini.js";
import { callGroq as callGroqDefault } from "../public/js/engine/groq.js";
import { callOpenrouter as callOpenrouterDefault } from "../public/js/engine/openrouter.js";
import { callCloudflare as callCloudflareDefault } from "../public/js/engine/cloudflare.js";

export function providerCalls({ call = callAnthropic, callGoogle = callGemini, callGroq = callGroqDefault, callOpenrouter = callOpenrouterDefault, callCloudflare = callCloudflareDefault } = {}) {
  return { anthropic: call, google: callGoogle, groq: callGroq, openrouter: callOpenrouter, cloudflare: callCloudflare };
}
