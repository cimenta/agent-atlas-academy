---
title: Memory: summaries
section: memory
order: 14
summary: Older messages are replaced by a short summary to keep the context small.
related: [memory-shared-conversation, what-each-agent-sees]
coming: true
---

With **summary memory**, old messages are condensed into a short summary, and the agent sees the summary plus the most recent messages.

**Good for**

- Long runs that would otherwise grow too large.
- Lower cost: fewer tokens are sent each time.

**Watch out for**

- A summary drops detail. A fact that seemed unimportant may be needed later.
- A summary can contain mistakes, and later steps will trust it.
- Writing the summary is itself a model call that costs time and tokens.

A good summary keeps decisions, open questions and key facts, and drops the wording. In a replay you can compare a summary with the messages it replaced.
