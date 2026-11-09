---
title: Sequential chain
section: orchestration
order: 6
summary: Agents work one after another. Each result feeds the next agent.
related: [single-agent, parallel-fan-out-fan-in, what-each-agent-sees]
---

In a **sequential chain** the agents form a line. The first one finishes, and its output goes to the second, and so on. A typical chain is: plan, research, analyse, write.

**Strengths**

- Easy to follow: you always know who works and why.
- Each agent has one narrow job and short instructions.
- Easy to test and to improve one step at a time.

**Weaknesses**

- Total time is the sum of all steps.
- A mistake early in the chain travels all the way down.
- Each agent sees only what is passed on, so useful detail can be lost along the way.

The order is fixed by the design, not by the agents. Use a chain when the task has natural stages that depend on each other.
