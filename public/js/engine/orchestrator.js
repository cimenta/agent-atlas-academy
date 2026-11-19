// Runs a design: checks it, builds the agents, runs the pattern, and always
// ends with exactly one "done" event that says how the run ended.
import { validateDesign } from "./patterns.js";
import { createBudget, LimitError } from "./budget.js";
import { createAgent } from "./agent.js";
import { nodeProvider } from "./catalog.js";
import { redact } from "./anthropic.js";
import { limitMessage } from "./harness.js";
import { clampLimits } from "./patterns.js";
import { createPassOn } from "./handoff.js";
import { createSpawner, nodeIdOf, MULTI_RUN } from "./spawn.js";
import { createNotebook } from "./notebook.js";
import { ApprovalPause } from "./approval.js";
import { clampHandoffChars } from "./catalog.js";
import * as sequential from "./runners/sequential.js";
import * as parallel from "./runners/parallel.js";
import * as supervisor from "./runners/supervisor.js";
import * as debate from "./runners/debate.js";
import * as evaluator from "./runners/evaluator.js";
import * as handoff from "./runners/handoff.js";
import * as router from "./runners/router.js";
import * as voting from "./runners/voting.js";
import * as mapreduce from "./runners/mapreduce.js";
import * as planexec from "./runners/planexec.js";
import { createRegistry } from "./created.js";

export const RUNNERS = {
  sequential: sequential.run,
  parallel: parallel.run,
  supervisor: supervisor.run,
  debate: debate.run,
  evaluator: evaluator.run,
  handoff: handoff.run,
  router: router.run,
  voting: voting.run,
  mapreduce: mapreduce.run,
  planexec: planexec.run,
};

// callFor(node) gives the provider call of an agent that names its own key slot; without it every agent uses `call`.
// resume: the answers of agents that already finished in an earlier try of this run, in order ({ agent, text, tokens }).
// An agent's first activations are answered from them without calling the provider, so the run goes through the
// same steps and carries on live where it failed. No run_start event is sent then: the caller already has it.
export async function runDesign({ design, task, limits, language = "en", call, callFor, emit, signal, now = Date.now, provider = "anthropic", resume = [], maxOutputTokens, retries, retryDelaySec, freeTier = false, repeatStop, handoffChars = 0, allowSearch = true, fallback = "off", approved = [], formatEnforcement = true }) {
  const startedAt = now();
  const send = (event) => emit({ ...event, t: now() - startedAt });

  const checked = validateDesign(design);
  if (!checked.ok) {
    send({ type: "error", message: `The design is not valid: ${checked.errors.map((e) => e.code).join(", ")}` });
    const usage = { input: 0, output: 0, searches: 0, steps: 0 };
    send({ type: "done", outcome: "failed", usage, finalText: "" });
    return { outcome: "failed", finalText: "", usage };
  }

  // The visitor can forbid web search for the whole run: the budget then has no searches, so no agent is given the tool.
  const searchOff = allowSearch === false;
  const budget = createBudget(searchOff ? { ...limits, maxSearches: 0 } : limits, { now });
  if (searchOff && design.nodes.some((node) => node.search === true)) {
    send({ type: "warning", webSearchOff: true, message: "Web search is turned off in Settings, Harness, Tools. No agent searched." });
  }
  const control = new AbortController();
  const onAbort = () => control.abort();
  if (signal?.aborted) control.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  // The shared notebook, only when the run has it switched on.
  const notebook = design.memory?.notebook === true ? createNotebook({ emit: send }) : null;
  // One approval of any run of a node covers all runs of it ("worker#1" approved means "worker" is approved).
  const isApproved = (id) => approved.some((a) => nodeIdOf(a) === nodeIdOf(id));
  const make = (node) =>
    createAgent({ node, design, call: callFor?.(node) ?? call, emit: send, budget, signal: control.signal, language, provider: nodeProvider(node, provider), maxOutputTokens, retries, retryDelaySec, freeTier, repeatStop, fallback, askFirst: node.approve === true && !isApproved(node.id), notebook, task, formatEnforcement, cached: resume.filter((r) => r.agent === node.id) });
  // The node that runs once for every part or step has no agent up front; the runner makes one for each run (spawn).
  const agents = new Map(design.nodes.filter((node) => node.agent !== MULTI_RUN[design.pattern]).map((node) => [node.id, make(node)]));
  const spawn = createSpawner({ design, make });
  // Agents that create agents: the registry checks each request and makes the agent (see created.js).
  const registry = design.nodes.some((n) => n.creates !== undefined) ? createRegistry({ design, agents, make, emit: send }) : null;
  const passOn = createPassOn({ chars: clampHandoffChars(handoffChars), emit: send });
  if (resume.length === 0) send({ type: "run_start", task, pattern: design.pattern, design });

  let outcome = "finished";
  let finalText = "";
  let reason;
  try {
    finalText = await RUNNERS[design.pattern]({ design, task, agents, spawn, emit: send, budget, signal: control.signal, passOn, create: registry ? registry.request : null });
  } catch (error) {
    control.abort();
    if (error instanceof ApprovalPause) {
      outcome = "waiting_approval";
    } else if (error instanceof LimitError) {
      outcome = "stopped_limit";
      reason = error.reason;
      // A runner may hand back what it had written so far (the evaluator loop returns its last draft).
      finalText = error.partialText ?? "";
      // The replay keeps a line that says which limit of the harness stopped the run.
      send({ type: "warning", ...(error.agent ? { agent: error.agent } : {}), limit: reason, message: limitMessage(reason, clampLimits(limits), { label: error.label, value: error.value }) });
    } else if (signal?.aborted) {
      outcome = "stopped_user";
      finalText = error?.partialText ?? "";
    } else {
      outcome = "failed";
      finalText = error?.partialText ?? "";
      send({ type: "error", message: redact(error?.message) || "The run failed" });
    }
  } finally {
    control.abort();
    signal?.removeEventListener("abort", onAbort);
  }

  const usage = budget.usage();
  send({ type: "done", outcome, usage, finalText, ...(reason ? { reason } : {}) });
  return { outcome, finalText, usage, ...(reason ? { reason } : {}) };
}
