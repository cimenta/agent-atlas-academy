// Mock mode: what OpenRouter's GET /key would answer. MOCK_OR_QUOTA=low|out|paid|none changes the numbers (default: 12 of 50 used).
export function mockOpenrouterKey(mode = process.env.MOCK_OR_QUOTA) {
  if (mode === "none") return { data: { label: "mock" } };
  const used = mode === "out" ? 50 : mode === "low" ? 47 : mode === "paid" ? 140 : 12;
  const limit = mode === "paid" ? 1000 : 50;
  return { data: { label: "mock", free_model_daily_requests: { used, limit, remaining: limit - used } } };
}
