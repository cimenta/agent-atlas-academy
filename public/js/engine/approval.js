// Human approval: an agent marked node.approve waits for a click before it runs for the first time.
// The run does not hold a connection open. It ends as "waiting_approval", and Approve carries it on with the
// answers that are already there (the same way Retry does), telling the engine which agents were approved.
export const APPROVAL_INPUT_MAX = 20000;

export class ApprovalPause extends Error {
  constructor(agent) {
    super("The run is waiting for approval");
    this.name = "ApprovalPause";
    this.agent = agent;
  }
}

// The agents a run record still waits on: an approval event with no approved event after it.
export function pendingApprovals(events) {
  const waiting = new Map();
  for (const e of events ?? []) {
    if (e.type === "approval") waiting.set(e.agent, e);
    else if (e.type === "approved") waiting.delete(e.agent);
  }
  return [...waiting.values()];
}

// Every agent the visitor approved so far in this run.
export const approvedAgents = (events) => [...new Set((events ?? []).filter((e) => e.type === "approved").map((e) => e.agent))];
