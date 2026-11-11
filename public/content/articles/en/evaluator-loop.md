---
title: Evaluator loop
section: orchestration
order: 10
summary: Generate, critique, revise. Repeat until the result is good enough or a limit is reached.
related: [self-critique, budgets-and-stop-conditions, supervisor-and-workers]
coming: true
---

In an **evaluator loop** one agent produces a draft and another agent, the **evaluator**, judges it against stated criteria. If it is not good enough, the feedback goes back to the first agent, which revises. The loop ends when the evaluator accepts the result or a limit is reached.

**Strengths**

- Often improves quality without a bigger model.
- The criteria are explicit, so you can see why something was rejected.

**Weaknesses**

- Every round costs time and tokens.
- A lenient evaluator accepts weak drafts. A harsh one never stops.
- The writer may change things that were already correct.

Always set a maximum number of rounds. Three rounds is a common small limit. A good evaluator gives specific feedback ("the second date is wrong"), not only a score.
