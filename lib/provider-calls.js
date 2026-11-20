// The function that sends a request to each provider, by provider id (the ids of the registry, engine/providers.js).
// The two options are the names the tests and the local mock server already use: call is Anthropic's, callGoogle is Gemini's.
import { callAnthropic } from "../public/js/engine/anthropic.js";
import { callGemini } from "../public/js/engine/gemini.js";

export function providerCalls({ call = callAnthropic, callGoogle = callGemini } = {}) {
  return { anthropic: call, google: callGoogle };
}
