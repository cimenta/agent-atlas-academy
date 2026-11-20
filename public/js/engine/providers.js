// The registry of providers: everything the code asks about a provider, in one place.
// Pure data (no imports), shared by the browser and the server function. A new provider is a new entry here
// plus an adapter in the engine and a call in lib/provider-calls.js.

// Prices are US dollars per million tokens. They are the figures of the current
// published tiers and are shown to the visitor only as an estimate.
// Check them against Anthropic's pricing page before every release.
export const PRICES_AS_OF = "2026-11-09";

export const MODELS = [
  { key: "fast", id: "claude-haiku-5-5", label: "Fast", inputPerMTok: 1, outputPerMTok: 5 },
  { key: "balanced", id: "claude-sonnet-5-5", label: "Balanced", inputPerMTok: 3, outputPerMTok: 15 },
  { key: "strong", id: "claude-opus-5-5", label: "Strong", inputPerMTok: 5, outputPerMTok: 25 },
];

// Anthropic bills each web search on top of the tokens (10 dollars per 1000).
export const SEARCH_PRICE_USD = 0.01;

// Google Gemini: the same three choices (fast, balanced, strong) with Google's models and prices.
// Check them against https://aistudio.google.com/docs/pricing before every release.
// Google raises some of these prices on 2026-12-01 and 2027-01-01.
// freeTier: false marks a model that Google does not offer on its free tier.
export const GOOGLE_MODELS = [
  { key: "fast", id: "gemini-3.5-flash-lite", label: "Fast", inputPerMTok: 0.3, outputPerMTok: 2.5, freeTier: true },
  { key: "balanced", id: "gemini-3.8-flash", label: "Balanced", inputPerMTok: 0.75, outputPerMTok: 3.75, freeTier: true },
  { key: "strong", id: "gemini-4-carbon", label: "Strong", inputPerMTok: 2, outputPerMTok: 10, freeTier: false },
];

// Groq: two open models (gpt-oss) as the same three choices; Balanced and Strong are the same model.
// Prices are per million tokens. Check them against https://groq.com/pricing before every release.
export const GROQ_MODELS = [
  { key: "fast", id: "openai/gpt-oss-20b", label: "Fast", inputPerMTok: 0.075, outputPerMTok: 0.3, freeTier: true },
  { key: "balanced", id: "openai/gpt-oss-120b", label: "Balanced", inputPerMTok: 0.15, outputPerMTok: 0.6, freeTier: true },
  { key: "strong", id: "openai/gpt-oss-120b", label: "Strong", inputPerMTok: 0.15, outputPerMTok: 0.6, freeTier: true },
];

// A key slot is a place for one API key. Anthropic has one; Gemini has two, one for a key on Google's free tier and
// one for a paid key, so both can be saved side by side. "google" is the paid slot (it is where a Gemini key was
// always kept); "google-free" is the free one. labelKey: the locale key of the name of the slot (null: the provider's label);
// subKey: the locale key of the small text under the name in the provider tiles (null: none). mark: the letter in the tile.
export const PROVIDERS = {
  anthropic: {
    id: "anthropic",
    label: "Anthropic",
    chipName: "Anthropic",
    color: "#d97757",
    mark: "A",
    models: MODELS,
    searchPriceUsd: SEARCH_PRICE_USD,
    pricesAsOf: PRICES_AS_OF,
    pricingUrl: "https://www.anthropic.com/pricing",
    keyUrl: null,
    slots: [{ id: "anthropic", free: false, labelKey: null, subKey: null }],
    refusedKeyPrefixes: [],
    capabilities: { search: true },
    wire: { noteKey: "replay.api.noteSame", map: [] },
    text: { keyLabel: "settings.keyLabel", keyLink: null, keyInline: "create.keyInline", dataNotice: "create.dataNotice", searchFee: "editor.searchFee", estimateSearch: "create.estimateSearch", pricingLink: null },
  },
  google: {
    id: "google",
    label: "Google",
    chipName: "Gemini",
    color: "#4285f4",
    mark: "G",
    models: GOOGLE_MODELS,
    // Grounding with Google Search: 14 dollars per 1000 after the free monthly allowance (shown as an upper bound).
    searchPriceUsd: 0.014,
    pricesAsOf: "2026-11-13",
    pricingUrl: "https://aistudio.google.com/docs/pricing",
    keyUrl: "https://aistudio.google.com/apikey",
    slots: [
      { id: "google-free", free: true, labelKey: "create.geminiFree", subKey: "create.providerFree" },
      { id: "google", free: false, labelKey: "create.geminiPaid", subKey: "create.providerPaid" },
    ],
    refusedKeyPrefixes: ["sk-ant-"],
    capabilities: { search: true },
    // What the API calls tab says about the format: the note (a locale key) and the main fields that change [inside, sent].
    wire: { noteKey: "replay.api.noteConverted", map: [["messages (role user, assistant)", "contents (role user, model)"], ["system", "systemInstruction"], ["max_tokens", "generationConfig.maxOutputTokens"], ["replySchema", "generationConfig.responseSchema"], ["web search tool", "tools: google_search"]] },
    text: { estimateFree: "create.estimateFree", freeWarning: "settings.freeTierWarning", keyLabel: "settings.googleKeyLabel", keyLink: "settings.googleKeyLink", keyInline: "create.keyInlineGoogle", dataNotice: "create.dataNoticeGoogle", searchFee: "editor.searchFeeGoogle", estimateSearch: "create.estimateSearchGoogle", pricingLink: "settings.googlePricingLink" },
  },
  groq: {
    id: "groq",
    label: "Groq",
    chipName: "Groq",
    color: "#f55036",
    mark: "Gq",
    models: GROQ_MODELS,
    searchPriceUsd: 0,
    pricesAsOf: "2026-11-20",
    pricingUrl: "https://groq.com/pricing",
    keyUrl: "https://console.groq.com/keys",
    slots: [
      { id: "groq-free", free: true, labelKey: "create.groqFree", subKey: "create.providerFree" },
      { id: "groq", free: false, labelKey: "create.groqPaid", subKey: "create.providerPaid" },
    ],
    refusedKeyPrefixes: ["sk-ant-"],
    // Version 1 has no web search on Groq: the editor switches it off and says why.
    capabilities: { search: false },
    // The limits of the free plan (the Developer base limits; Groq counts them for each model and for the whole account).
    // Verify them on Groq's pages before every release: two of its pages disagreed on 2026-11-20.
    freeLimits: { kind: "account-plan", scope: "account", perModel: true, rpm: 30, tpm: 8000, rpd: 1000, tpd: 200000, verifiedOn: "2026-11-20" },
    wire: { noteKey: "replay.api.noteConverted", map: [["system", "first message with role system"], ["max_tokens", "max_completion_tokens"], ["replySchema", "response_format (json_schema, strict)"], ["tool use, tool result", "tool_calls, role tool"], ["usage input, output tokens", "usage prompt_tokens, completion_tokens"]] },
    text: { estimateFree: "create.estimateFreeGroq", freeWarning: "settings.groqFreeWarning", keyLabel: "settings.groqKeyLabel", keyLink: "settings.groqKeyLink", keyInline: "create.keyInlineGroq", dataNotice: "create.dataNoticeGroq", searchFee: "editor.searchFeeGroq", estimateSearch: "create.estimateSearchGroq", pricingLink: "settings.groqPricingLink" },
  },
};

export const PROVIDER_IDS = Object.keys(PROVIDERS);

// Every key slot, in the order of the providers: [{ id, provider, free, labelKey }].
export const SLOTS = PROVIDER_IDS.flatMap((provider) => PROVIDERS[provider].slots.map((s) => ({ id: s.id, provider, free: s.free, labelKey: s.labelKey, subKey: s.subKey })));
export const SLOT_IDS = SLOTS.map((s) => s.id);

// The entry of a provider; an unknown id gives the first provider, as providerCatalog does.
export const providerSpec = (providerId) => PROVIDERS[providerId] ?? PROVIDERS[PROVIDER_IDS[0]];
// The slot a key of the provider goes in: the free slot when it is wanted and there is one, else the paid slot, else the first.
// An unknown provider gives the first slot of the first provider.
export function defaultSlot(providerId, free = false) {
  const ids = PROVIDERS[providerId] ? slotsOf(providerId) : slotsOf(PROVIDER_IDS[0]);
  return (free ? freeSlotOf(providerId) : null) ?? ids.find((id) => !SLOTS.find((s) => s.id === id).free) ?? ids[0];
}
// The free-plan limits that apply to a key slot (null: the slot is paid, or its provider has none).
export const freeLimitsOf = (slotId) => {
  const slot = SLOTS.find((s) => s.id === slotId);
  return slot?.free ? PROVIDERS[slot.provider].freeLimits ?? null : null;
};
export const slotsOf = (providerId) => SLOTS.filter((s) => s.provider === providerId).map((s) => s.id);
export const freeSlotOf = (providerId) => SLOTS.find((s) => s.provider === providerId && s.free)?.id ?? null;

// A key of a plausible shape for the provider: 20 to 300 characters, and not a key of another provider that is known to be refused.
export const keyShapeOk = (providerId, key) =>
  typeof key === "string" && key.length >= 20 && key.length <= 300 && !(PROVIDERS[providerId]?.refusedKeyPrefixes ?? []).some((prefix) => key.startsWith(prefix));
