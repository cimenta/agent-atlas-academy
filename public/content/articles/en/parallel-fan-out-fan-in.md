---
title: Parallel fan-out and fan-in
section: orchestration
order: 7
summary: Split a task into independent parts, run them at the same time, then combine the results.
related: [sequential-chain, budgets-and-stop-conditions, retries-and-errors]
---

**Fan-out** means splitting a task into parts and giving each part to an agent that works **at the same time**. **Fan-in** means collecting the results and combining them, usually with one more agent.

Example: compare three products. Three agents each research one product in parallel, then a writer compares them.

**Strengths**

- Waiting time is set by the slowest part, not by the sum of all parts.
- Each agent can focus on a smaller piece.

**Weaknesses**

- The parts must be independent. If one needs another's result, use a chain.
- It uses at least as many tokens as a chain, often more.
- Many calls at once can hit a provider's rate limits.
- The combining step has to reconcile differences between the parts.

In a replay you will see several agents highlighted together.
