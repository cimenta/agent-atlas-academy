---
title: Memory: shared conversation
section: memory
order: 13
summary: All messages go into one growing thread that every agent can read.
related: [what-each-agent-sees, memory-summaries, tokens-cost-and-time]
---

With a **shared conversation**, all messages are kept in one thread and each agent reads the whole thread when it takes its turn.

**Good for**

- Consistency: everyone knows what was said and decided.
- Easy to understand and to debug, since the thread is the full story.

**Watch out for**

- The thread grows with every step, and the whole thing is sent again on each call. Cost and time rise as the run goes on.
- Every model has a limit on how much it can read at once. A long thread can reach it.
- Irrelevant old messages can distract an agent.
- Anything sensitive in the thread is visible to every agent.

When the thread becomes too large, one common answer is to replace old messages with a summary.
