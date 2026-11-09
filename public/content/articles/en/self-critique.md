---
title: Self-critique
section: tools-and-output
order: 18
summary: An agent reviews work, its own or another agent's, and points out problems.
related: [evaluator-loop, guardrails]
---

In **self-critique** an agent is asked to review a piece of work against criteria and list what is wrong or missing. The work may be its own earlier draft or another agent's output.

**Why it helps**

- Models often find errors in a finished text that they did not avoid while writing it.
- Specific feedback gives the next revision something to act on.

**Limits**

- The same model may share the same blind spots, so it may not notice the same kind of mistake.
- A critique asked for in vague terms ("is this good?") tends to approve everything.
- Each review is an extra call that costs time and tokens.

Better results usually come from clear criteria, a separate reviewer role and, when you can, checking facts against a source instead of asking opinion alone.
