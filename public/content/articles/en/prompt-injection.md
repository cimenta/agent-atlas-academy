---
title: Prompt injection
section: security
order: 24
summary: Text from outside tries to give the agent new orders.
related: [trust-boundaries, least-privilege, guardrails, human-approval]
---

An agent reads text from outside: web pages, files, tool results. **Prompt injection** happens when that text contains instructions, such as "ignore your previous instructions and do this instead", and the agent follows them.

The cause is simple: to a language model, instructions and data are both just text. It cannot reliably tell which is which.

**What reduces the damage**

- Treat everything from tools as data, and say so in the instructions.
- Give agents only the tools they need, so a hijacked agent can do little.
- Check outputs before they are used or sent on.
- Require human approval for risky actions.
- Do not let untrusted text flow into the instructions of other agents.

No single measure is enough. A **recorded** demonstration of prompt injection, using a harmless page, is coming to the library. Agent Atlas will never attack anything live.
