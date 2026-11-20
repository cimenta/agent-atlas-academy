// Pure helpers for the Library page: the facts of a run and the text the search box looks at.
import { nodeModel, nodeProvider, providersOf } from "./engine/catalog.js";

// The facts of the Settings section of the detail, read from the run itself.
export function runFacts(run) {
  const nodes = Array.isArray(run?.design?.nodes) ? run.design.nodes.filter((n) => n !== null && typeof n === "object") : [];
  const recorded = typeof run?.recordedWith?.provider === "string" && run.recordedWith.provider !== "" ? run.recordedWith.provider.split("+")[0] : "anthropic";
  const design = { nodes };
  return {
    pattern: run?.pattern ?? run?.design?.pattern ?? "",
    language: run?.language ?? "",
    agents: nodes.length,
    providers: nodes.length > 0 ? providersOf(design, recorded) : [recorded],
    models: nodes.map((n) => ({ agent: n.name || n.id, provider: nodeProvider(n, recorded), model: nodeModel(n, recorded).id })),
    limits: run?.limits ?? null,
    hasApiLog: Array.isArray(run?.apiCalls) && run.apiCalls.length > 0,
    calls: Array.isArray(run?.apiCalls) ? run.apiCalls.length : 0,
    outcome: run?.outcome ?? "",
    createdAt: run?.createdAt ?? null,
  };
}

// The buttons of the detail, in order: Load first; Use in Create when the run has a definition; Send when it may be sent;
// the last three only for your own runs.
export function actionList({ source, hasDefinition, canSubmit }) {
  const own = source === "local";
  return ["load", ...(hasDefinition ? ["use-in-create"] : []), "export", "compare", ...(own && canSubmit ? ["send"] : []), ...(own ? ["delete", "edit-description"] : [])];
}

// What a card is searched by: the title, the pattern, the providers, how it ended, and the text of the detail when it is known.
export function searchText(item, detail = null) {
  const detailText = detail && typeof detail === "object" ? [detail.about, detail.how, detail.learns, detail.watch].filter((x) => typeof x === "string").join(" ") : "";
  return [item.title, item.pattern, item.provider, item.outcome, item.id, detailText].filter(Boolean).join(" ");
}
