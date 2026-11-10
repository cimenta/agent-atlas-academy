// The Result tab in the header has a light green background when there is a result to see.
const RESULT_TAB = '[data-ui="tab-result"]';

// With an id the tab leads to that run's result, so a run opened from the library is the one shown.
export function markResultTab(doc, hasResult, id) {
  const tab = doc.querySelector?.(RESULT_TAB);
  if (!tab) return;
  if (hasResult) tab.classList.add("has-result");
  else tab.classList.remove("has-result");
  if (hasResult && typeof id === "string" && id !== "") tab.setAttribute("href", `#/play/result/${id}`);
}

// A result exists when the visitor has at least one run of their own (or a run is open on the Result tab).
export async function refreshResultTab(ctx, forced = false, id) {
  try {
    const runs = await ctx.runStore.list();
    markResultTab(ctx.doc, forced || runs.length > 0, id);
  } catch {
    markResultTab(ctx.doc, forced, id);
  }
}
