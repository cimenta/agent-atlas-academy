// The tabs of the settings of one agent in the diagram editor.
// creator: the agent may be allowed to create agents (a Supervisor or a Planner), so it has the tab Creating, last.
export function agentTabIds({ notebookOn, creator = false }) {
  return ["tools", "condense", "approval", ...(notebookOn ? ["notebook"] : []), "limits", ...(creator ? ["creates"] : [])];
}

// The tab that was open, or the first one when it is not there any more.
export function currentAgentTab(current, ids) {
  return ids.includes(current) ? current : ids[0];
}
