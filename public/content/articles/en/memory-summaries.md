---
title: Memory: summaries
section: memory
order: 14
summary: Older messages are replaced by a short summary to keep the context small.
related: [memory-shared-conversation, memory-scratchpad, context-window, what-each-agent-sees]
---

With **summary memory**, old messages are condensed into a short summary, and the agent sees the summary plus the most recent messages.

**Good for**

- Long runs that would otherwise grow too large.
- Lower cost: fewer tokens are sent each time.

**Watch out for**

- A summary drops detail. A fact that seemed unimportant may be needed later.
- A summary can contain mistakes, and later steps will trust it.
- Writing the summary is itself a model call that costs time and tokens.

**In Agent Atlas** this is called *condensing*. You switch it on for one agent with Condense what this agent receives in Create. Before that agent starts, one extra call to the fast model shortens what earlier agents wrote to at most 150 words. The task is never shortened, and a text shorter than 1500 characters is passed on as it is. The extra call counts as a step and its tokens count against your limits. The replay shows what was shortened, what the agent read instead and the full text on demand, and the Context tab shows the smaller input.

A good summary keeps decisions, open questions and key facts, and drops the wording. In a replay you can compare a summary with the messages it replaced.
