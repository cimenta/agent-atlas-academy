---
title: What is orchestration?
section: basics
order: 2
summary: Deciding which agents work, in what order, with what information, and when to stop.
related: [what-is-an-agent, single-agent, sequential-chain, supervisor-and-workers]
---

**Orchestration** is how several agents are organised to finish one task. It answers four questions:

1. **Who works?** Which agents take part.
2. **When?** One after another, at the same time, or chosen as the work goes on.
3. **What do they see?** The information each agent receives.
4. **When does it stop?** Success, a limit, or a failure.

The same agents arranged differently can give different quality, cost and speed. That is why Agent Atlas lets you run one task with different patterns. Putting the runs side by side to compare them is coming.

Sometimes ordinary program code decides the order. Sometimes an agent decides, as in the supervisor pattern. Either way, the orchestration is what turns a set of separate model calls into one process.
