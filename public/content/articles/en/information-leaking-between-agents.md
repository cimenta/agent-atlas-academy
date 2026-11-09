---
title: Information leaking between agents
section: security
order: 29
summary: What one agent knows can reach another through shared messages, summaries and notes.
related: [what-each-agent-sees, memory-scratchpad, trust-boundaries]
---

Agents pass information to each other by messages, summaries and shared notes. That is how teamwork happens, and it is also how information **leaks**.

If one agent receives something sensitive, such as personal data or a secret, it can end up in:

- the next agent's input,
- a summary that replaces old messages,
- a shared scratchpad that every agent reads,
- the final answer shown to the user,
- a saved run that is later published.

The defences are simple to state:

- Share only what the next agent needs.
- Remove or mask sensitive values before passing them on.
- Never put secrets, such as API keys, into instructions or messages.
- Look through a run before publishing it. A published run is public and cannot be fully taken back.

When you publish a run on Agent Atlas, you confirm that it contains no personal data.
