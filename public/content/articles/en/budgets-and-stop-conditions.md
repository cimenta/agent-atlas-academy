---
title: Budgets and stop conditions
section: control-and-cost
order: 21
summary: Limits that end a run before it wastes time or money.
related: [evaluator-loop, supervisor-and-workers, tokens-cost-and-time, retries-and-errors, harness]
---

An agent loop decides for itself when it is finished, and sometimes it never decides. A **stop condition** ends the run for a reason that does not depend on the agent's judgment.

Typical limits:

- **Rounds**: the maximum number of steps or loops.
- **Tokens**: the maximum amount of text processed.
- **Time**: the maximum duration.
- **Tool calls**: for example, at most a few web searches.

A good run also stops cleanly. It should keep what was already finished and say why it stopped, instead of vanishing.

In Agent Atlas every run is limited, and the time limit is 270 seconds. A run that hits a limit is marked as stopped and the completed part is still replayable. These limits also keep the app educational: it is meant for small experiments, not for real work.

Besides the limits of the whole run, Agent Atlas has a few more stop conditions. Settings, Harness has a **cost cap** that stops a run when its estimated cost passes an amount, and **repeated answers**, which stops a run when the same agent gives the same answer again and again. In Create a single agent can have limits of its own, and you choose whether the run stops there or the agent passes on what it wrote. A run that waits for your approval is not stopped by the clock, because the wait does not count toward the time limit.

Create warns you before you run when the design will probably reach a limit. To see where a limit would cut a recorded run without spending anything, use the [Harness lab](#/learn/lab).
