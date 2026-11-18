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

In Agent Atlas you can try it in Create. In the evaluator loop, switch on **The Writer judges its own draft**. The evaluator goes away, and the Writer writes a draft, then answers a second time as its own judge against your criteria, and rewrites if it is not satisfied. It is cheaper than a separate evaluator, but the replay is a good place to see how often a model accepts its own text. Switch it off to bring the evaluator back and compare the two runs.

Better results usually come from clear criteria, a separate reviewer role and, when you can, checking facts against a source instead of asking opinion alone.
