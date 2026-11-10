// The Result tab in the header has a light green background when there is a result to see.
const RESULT_TAB = '[data-ui="tab-result"]';

export function markResultTab(doc, hasResult) {
  const tab = doc.querySelector?.(RESULT_TAB);
  if (!tab) return;
  if (hasResult) tab.classList.add("has-result");
  else tab.classList.remove("has-result");
}

// A result exists when the visitor has at least one run of their own (or a run is open on the Result tab).
export async function refreshResultTab(ctx, forced = false) {
  try {
    const runs = await ctx.runStore.list();
    markResultTab(ctx.doc, forced || runs.length > 0);
  } catch {
    markResultTab(ctx.doc, forced);
  }
}
