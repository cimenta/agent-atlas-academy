---
title: Human approval
section: control-and-cost
order: 22
summary: Pausing so a person can check, edit or refuse before the agents continue.
related: [least-privilege, guardrails, prompt-injection, budgets-and-stop-conditions, harness]
---

In a **human approval** step, the run stops and waits for a person before something important happens. The person can approve what the agent is about to do, or stop the run.

**Where it helps**

- Before an action that is hard to undo.
- Before sending anything to the outside world.
- Before a step that costs a lot, or that writes the final answer.
- At a point where the agents tend to go wrong and a person can steer cheaply.

**The trade-off**

- It slows the process, and a person must be there.
- People get tired. If approval is asked too often, they click "yes" without reading, and the check is worth nothing.

So approvals work best when they are rare and when the person is shown clearly what will happen.

**In Agent Atlas**

In Create, select an agent and switch on **Ask me before this agent runs**. When the run reaches that agent it stops, before the agent is called, and shows the text the agent would receive. You choose **Approve and continue** or **Stop here**.

- While the run waits, nothing runs and nothing is paid. The agents that already finished keep their answers.
- The wait does not count toward the time limit of the run. No connection is held open: the paused run is saved with your other runs, so you can come back to it from Play later.
- Approve carries the run on the same way Retry does: the finished agents are not called again. The replay marks the step as approved by you.
- Stop here ends the run as stopped by you. Everything done so far stays in the replay.
- If several agents work in parallel when one of them pauses, the others that were still working are run again after you approve.
- Only your own runs can be approved. A run from the library is a recording and has nothing to approve.

An approval should come before the step that matters, not after it: once an agent has run, the text is written and the tokens are spent.
