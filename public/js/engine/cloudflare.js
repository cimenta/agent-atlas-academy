// The only place that names Cloudflare Workers AI's addresses. The conversion is the shared chat-completions adapter.
// The key is one field, ACCOUNT_ID:TOKEN: the account id is part of every address, the token is the bearer.
// Cloudflare sends max_completion_tokens (max_tokens is deprecated there) and no reasoning effort.
import { callChatCompletions } from "./openai-compat.js";
import { AnthropicError, redact, getJson } from "./anthropic.js";

const ROOT = "https://api.cloudflare.com/client/v4/accounts";
// The answer when the free pool of neurons of the day is used up. Its exact status and body are not in Cloudflare's pages (the owner's
// test settles them), so any 4xx that is not a refusal of the key and talks about the allocation or neurons counts as the day limit.
export const QUOTA_PATTERN = /daily free allocation|neurons/i;

// { accountId, token } of an ACCOUNT_ID:TOKEN key (split at the first colon), or null when it does not have that shape.
export function splitCloudflareKey(key) {
  if (typeof key !== "string") return null;
  const text = key.trim();
  const colon = text.indexOf(":");
  if (colon < 0) return null;
  const accountId = text.slice(0, colon);
  const token = text.slice(colon + 1);
  return /^[0-9a-f]{32}$/i.test(accountId) && token !== "" ? { accountId: accountId.toLowerCase(), token } : null;
}

const hide = (text, { accountId, token }) => redact(redact(text, token), accountId);

// What an error of Cloudflare says to the reader: the key parts are hidden, and a quota answer becomes a day limit (429) so the agent
// stops the run with everything saved.
function cleaned(error, parts) {
  if (!(error instanceof AnthropicError)) return error;
  error.message = hide(error.message, parts);
  // Cloudflare itself ends a call that runs about two minutes (408, code 3046), which a long reply of a slow model reaches.
  if (error.status === 408 || error.code === 3046) {
    error.message = "Timeout: Cloudflare ended the call because the answer took about two minutes." + String.fromCharCode(10, 10) + "The model is slow, or the reply is long. Press Retry, pick a faster model with the arrow next to Retry, or lower the output tokens of the agent.";
    return error;
  }
  const refused = error.status === 401 || error.status === 403;
  if (!refused && error.status >= 400 && error.status < 500 && (error.code === 4006 || QUOTA_PATTERN.test(error.message))) {
    error.status = 429;
    error.rateKind = "day";
    error.pool = true;
    error.retryAfterSec = null;
  }
  return error;
}

export async function callCloudflare(body, options = {}) {
  const parts = splitCloudflareKey(options.apiKey);
  if (parts === null) throw new AnthropicError("The Cloudflare key must be ACCOUNT_ID:TOKEN");
  try {
    return await callChatCompletions(body, { ...options, apiKey: parts.token, url: `${ROOT}/${parts.accountId}/ai/v1/chat/completions`, who: "Cloudflare", maxTokensField: "max_completion_tokens", reasoningEffort: null });
  } catch (error) {
    throw cleaned(error, parts);
  }
}

// The text generation models the account can use (the address is Cloudflare's own model search; to be confirmed by the owner's test).
export async function listCloudflareModels({ apiKey, fetchImpl, signal, timeoutMs } = {}) {
  const parts = splitCloudflareKey(apiKey);
  if (parts === null) throw new AnthropicError("The Cloudflare key must be ACCOUNT_ID:TOKEN");
  try {
    const data = await getJson(`${ROOT}/${parts.accountId}/ai/models/search?task=Text%20Generation&per_page=100`, { headers: { authorization: `Bearer ${parts.token}` }, apiKey: parts.token, fetchImpl, signal, timeoutMs, who: "Cloudflare" });
    return Array.isArray(data?.result) ? data.result.map((m) => m?.name) : [];
  } catch (error) {
    throw cleaned(error, parts);
  }
}
