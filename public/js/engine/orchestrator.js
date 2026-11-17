// Runs a design: checks it, builds the agents, runs the pattern, and always
// ends with exactly one "done" event that says how the run ended.
import { validateDesign } from "./patterns.js";
import { createBudget, LimitError } from "./budget.js";
import { createAgent } from "./agent.js";
import { nodeProvider } from "./catalog.js";
import { redact } from "./anthropic.js";
import { limitMessage } from "./harness.js";
import { clampLimits } from "./patterns.js";
import * as sequential from "./runners/sequential.js";
import * as parallel from "./runners/parallel.js";
import * as supervisor from "./runners/supervisor.js";
import * as debate from "./runners/debate.js";

export const RUNNERS = {
  sequential: sequential.run,
  parallel: parallel.run,
  supervisor: supervisor.run,
  debate: debate.run,
};

// callFor(node) gives the provider call of an agent that names its own key slot; without it every agent uses `call`.
// resume: the answers of agents that already finished in an earlier try of this run, in order ({ agent, text, tokens }).
// An agent's first activations are answered from them without calling the provider, so the run goes through the
// same steps and carries on live where it failed. No run_start event is sent then: the caller already has it.
export async function runDesign({ design, task, limits, language = "en", call, callFor, emit, signal, now = Date.now, provider = "anthropic", resume = [], maxOutputTokens }) {
  const startedAt = now();
  const send = (event) => emit({ ...event, t: now() - startedAt });

  const checked = validateDesign(design);
  if (!checked.ok) {
    send({ type: "error", message: `The design is not valid: ${checked.errors.map((e) => e.code).join(", ")}` });
    const usage = { input: 0, output: 0, searches: 0, steps: 0 };
    send({ type: "done", outcome: "failed", usage, finalText: "" });
    return { outcome: "failed", finalText: "", usage };
  }

  const budget = createBudget(limits, { now });
  const control = new AbortController();
  const onAbort = () => control.abort();
  if (signal?.aborted) control.abort();
  else signal?.addEventListener("abort", onAbort, { once: true });

  const agents = new Map(
    design.nodes.map((node) => [
      node.id,
      createAgent({ node, design, call: callFor?.(node) ?? call, emit: send, budget, signal: control.signal, language, provider: nodeProvider(node, provider), maxOutputTokens, cached: resume.filter((r) => r.agent === node.id) }),
    ]),
  );
  if (resume.length === 0) send({ type: "run_start", task, pattern: design.pattern, design });

  let outcome = "finished";
  let finalText = "";
  let reason;
  try {
    finalText = await RUNNERS[design.pattern]({ design, task, agents, emit: send, budget, signal: control.signal });
  } catch (error) {
    control.abort();
    if (error instanceof LimitError) {
      outcome = "stopped_limit";
      reason = error.reason;
      // The replay keeps a line that says which limit of the harness stopped the run.
      send({ type: "warning", limit: reason, message: limitMessage(reason, clampLimits(limits)) });
    } else if (signal?.aborted) {
      outcome = "stopped_user";
    } else {
      outcome = "failed";
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
