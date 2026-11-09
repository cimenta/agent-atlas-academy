---
title: Supervisor and workers
section: orchestration
order: 8
summary: A supervisor agent decides which worker to use next and what to ask.
related: [handoff, evaluator-loop, budgets-and-stop-conditions]
---

In this pattern one agent, the **supervisor**, does not do the detailed work. It reads the task, chooses a **worker** agent, gives it an instruction, reads the answer, and decides what to do next. When it judges the task complete, it writes the final result.

**Strengths**

- Flexible: the route is chosen while the task is running, not fixed in advance.
- Workers stay simple and specialised.
- Good for tasks where you cannot tell in advance which steps will be needed.

**Weaknesses**

- Every decision is another model call, so it costs more time and tokens.
- The supervisor can pick the wrong worker, repeat itself or never decide it is done.
- It is harder to predict than a chain.

That is why a supervisor always needs limits: a maximum number of rounds, tokens and time.
