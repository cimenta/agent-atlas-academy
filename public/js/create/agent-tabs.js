// The tabs of the settings of one agent in the diagram editor.
export function agentTabIds({ notebookOn }) {
  return ["tools", "condense", "approval", ...(notebookOn ? ["notebook"] : []), "limits"];
}

// The tab that was open, or the first one when it is not there any more.
export function currentAgentTab(current, ids) {
  return ids.includes(current) ? current : ids[0];
}
