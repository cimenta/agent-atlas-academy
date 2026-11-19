// The tabs of the settings of one agent in the diagram editor.
// creator: the agent may be allowed to create agents (a Supervisor or a Planner), so it has the tab Creating, last.
// formatOk: the agent may have an answer format, so it has the tab Format after Limits.
// guardrailsOk: the agent may have guardrails, so it has the tab Guardrails after Format.
export function agentTabIds({ notebookOn, creator = false, formatOk = false, guardrailsOk = false }) {
  return ["tools", "condense", "approval", ...(notebookOn ? ["notebook"] : []), "limits", ...(formatOk ? ["format"] : []), ...(guardrailsOk ? ["guardrails"] : []), ...(creator ? ["creates"] : [])];
}

// The tab that was open, or the first one when it is not there any more.
export function currentAgentTab(current, ids) {
  return ids.includes(current) ? current : ids[0];
}
