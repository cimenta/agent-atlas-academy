---
title: What each agent sees
section: memory
order: 11
summary: An agent can only use the information it is given. Choosing what to give is a key design decision.
related: [memory-none, memory-shared-conversation, memory-summaries, information-leaking-between-agents]
---

An agent knows nothing that is not in its input. So a central question in orchestration is: **what does each agent get to see?**

Common choices:

- **The full history** of everything so far.
- **Only the handoff**: the previous agent's output or a short note.
- **A summary** of earlier steps.
- **Selected notes** from a shared scratchpad.

**More context** helps an agent stay consistent and avoid repeating work, but it costs more tokens, can distract the agent and may expose information it does not need.

**Less context** is cheaper and more focused, but the agent may lack something important.

When a run goes wrong, check first what the failing agent was actually shown. In a replay, click its first step.
