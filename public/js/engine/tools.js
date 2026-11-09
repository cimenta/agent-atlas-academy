// The tools an agent can be given. Each entry says what it is, whether it costs
// extra, and how to describe it to the provider. Adding a tool is a new entry.

export const TOOLS = {
  web_search: {
    key: "web_search",
    label: "Web search",
    extraFee: true,
    // Anthropic's web search runs inside the API call. Check the current tool
    // type string in Anthropic's documentation before each release.
    definition: (maxUses) => ({ type: "web_search_20250305", name: "web_search", max_uses: maxUses }),
  },
};

export function toolsFor(node, budget) {
  const remaining = budget.remainingSearches();
  if (node.search === true && remaining > 0) return [TOOLS.web_search.definition(remaining)];
  return [];
}
