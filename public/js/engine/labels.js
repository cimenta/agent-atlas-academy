// The name an agent is shown with. A free agent or a debater shows the name it was given. Agents of the same type
// are numbered in the order they are in the design (Debater 1, Debater 2), so they can be told apart.
const CAN_BE_NAMED = new Set(["free", "debater"]);
const givenName = (node) => (CAN_BE_NAMED.has(node.agent) && typeof node.name === "string" ? node.name.trim() : "");

export function agentLabel(node, design, baseLabel) {
  if (givenName(node)) return givenName(node);
  const same = Array.isArray(design?.nodes) ? design.nodes.filter((n) => n.agent === node.agent && !givenName(n)) : [];
  if (same.length < 2) return baseLabel;
  return `${baseLabel} ${same.findIndex((n) => n.id === node.id) + 1}`;
}

// For runs recorded before agents were numbered: the same label on several agents becomes label 1, label 2, ...
export function numberRepeatedLabels(labels) {
  const totals = new Map();
  for (const label of labels) totals.set(label, (totals.get(label) ?? 0) + 1);
  const seen = new Map();
  return labels.map((label) => {
    if (totals.get(label) < 2) return label;
    seen.set(label, (seen.get(label) ?? 0) + 1);
    return `${label} ${seen.get(label)}`;
  });
}
