---
title: Single agent
section: orchestration
order: 5
summary: One agent does the whole task. The baseline to compare everything else against.
related: [sequential-chain, models-size-cost-quality]
coming: true
---

In this pattern **one agent does everything**: it plans, gathers information, thinks and writes the answer.

**Strengths**

- The simplest to build and to understand.
- The cheapest in most cases: fewer calls and no hand-over text.
- Nothing is lost between steps, because there are no steps between agents.

**Weaknesses**

- One set of instructions has to cover every skill the task needs.
- A long task can fill the agent's context and make it lose track.
- There is no second opinion.

Always try the single agent first. If it does the job well, extra agents only add cost. Agent Atlas uses it as the **baseline**: run it on a task, then run a more complex pattern and see whether the extra complexity paid off.
