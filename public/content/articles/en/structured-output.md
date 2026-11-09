---
title: Structured output
section: tools-and-output
order: 17
summary: Asking an agent to answer in a fixed format so the next step can rely on it.
related: [guardrails, retries-and-errors, sequential-chain]
---

When one agent's answer is read by program code, or by another agent that expects a certain layout, free text is risky. **Structured output** means asking for an answer in a fixed shape, such as JSON with named fields: `title`, `claims`, `sources`.

**Why it helps**

- The next step can pick out exactly the field it needs.
- The shape can be checked automatically.
- Handoffs between agents become clearer.

**Watch out for**

- Models sometimes break the format, for example by leaving a field out or adding extra text.
- So the format must be validated. If it fails, the usual answers are to retry with an error message, or to stop.
- A valid format does not mean the content is true. Check facts separately.
