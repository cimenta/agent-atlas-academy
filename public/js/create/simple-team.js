// The Simple view of Create starts every pattern with a team that is ready to run, so the student does not have to know the agent types.
// The agents are free agents with a name and a role (the student can change both); the agents a pattern cannot run without
// (the combiner of Parallel, the router of Router, the writer and the evaluator of the evaluator loop) are already placed by the editor.
// Pure: it only calls the editor and the translator.

// The patterns that get a team, and how many free agents each one gets.
export const SIMPLE_TEAM_SIZE = { sequential: 3, parallel: 3, router: 2 };

// Fills a freshly reset editor. t gives the names and roles: create.simple.team.<pattern>.<n>.name and .role.
export function fillSimpleTeam(editor, pattern, t) {
  const size = SIMPLE_TEAM_SIZE[pattern] ?? 0;
  const ids = [];
  for (let n = 1; n <= size; n++) {
    const added = editor.addNode("free", { name: t(`create.simple.team.${pattern}.${n}.name`), instructions: t(`create.simple.team.${pattern}.${n}.role`) });
    if (added.ok) ids.push(added.id);
  }
  const nodes = editor.design().nodes;
  if (pattern === "sequential") for (let i = 0; i + 1 < ids.length; i++) editor.connect(ids[i], ids[i + 1]);
  if (pattern === "parallel") {
    const combiner = nodes.find((n) => n.agent === "combiner");
    if (combiner) for (const id of ids) editor.connect(id, combiner.id);
  }
  if (pattern === "router") {
    const router = nodes.find((n) => n.agent === "router");
    if (router) for (const id of ids) editor.connect(router.id, id);
  }
}

// What the team looks like now: names, roles and arrows. The page compares it with the signature it stored after the fill, to tell
// a team the student has not touched (changing the pattern needs no question) from one they have worked on.
export function teamSignature(design) {
  return JSON.stringify([design.nodes.map((n) => [n.id, n.agent, n.name ?? "", n.instructions ?? ""]), design.edges.map((e) => `${e.from}>${e.to}`)]);
}

// The example buttons next to the title of Create: one for each pattern of the Simple view. The icon is a few strokes (16 x 16); the label, the hint
// and the task are create.quick.<pattern>.label, .hint and .task.
export const QUICK_STARTS = [
  { pattern: "sequential", icon: ["M2 8h12", "M10 4l4 4-4 4"] },
  { pattern: "parallel", icon: ["M2 4h12", "M2 8h12", "M2 12h12"] },
  { pattern: "router", icon: ["M2 8h4", "M6 8l8-4", "M6 8l8 4"] },
  { pattern: "evaluator", icon: ["M3 8a5 5 0 0 1 9-3", "M12 2v3H9", "M13 8a5 5 0 0 1-9 3", "M4 14v-3h3"] },
];
