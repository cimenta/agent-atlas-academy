// Runs a design: checks it, builds the agents, runs the pattern, and always
// ends with exactly one "done" event that says how the run ended.
import { validateDesign } from "./patterns.js";
import { createBudget, LimitError } from "./budget.js";
import { createAgent } from "./agent.js";
import { redact } from "./anthropic.js";
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

export async function runDesign({ design, task, limits, language = "en", call, emit, signal, now = Date.now, provider = "anthropic" }) {
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
    design.nodes.map((node) => [node.id, createAgent({ node, design, call, emit: send, budget, signal: control.signal, language, provider })]),
  );
  send({ type: "run_start", task, pattern: design.pattern, design });

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
