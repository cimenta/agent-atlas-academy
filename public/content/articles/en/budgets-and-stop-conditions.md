---
title: Budgets and stop conditions
section: control-and-cost
order: 21
summary: Limits that end a run before it wastes time or money.
related: [evaluator-loop, supervisor-and-workers, tokens-cost-and-time, retries-and-errors]
---

An agent loop decides for itself when it is finished, and sometimes it never decides. A **stop condition** ends the run for a reason that does not depend on the agent's judgment.

Typical limits:

- **Rounds**: the maximum number of steps or loops.
- **Tokens**: the maximum amount of text processed.
- **Time**: the maximum duration.
- **Tool calls**: for example, at most a few web searches.

A good run also stops cleanly. It should keep what was already finished and say why it stopped, instead of vanishing.

In Agent Atlas every run is limited, and the time limit is 270 seconds. A run that hits a limit is marked as stopped and the completed part is still replayable. These limits also keep the app educational: it is meant for small experiments, not for real work.
