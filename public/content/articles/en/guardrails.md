---
title: Guardrails
section: security
order: 28
summary: Checks on what goes into and comes out of an agent.
related: [structured-output, self-critique, human-approval, prompt-injection]
coming: true
---

**Guardrails** are checks placed around an agent. They can look at the input before the agent sees it, or at the output before it is used.

Kinds of check:

- **Format**: is the answer valid JSON with the required fields?
- **Rules**: does it contain forbidden content or secrets? Is it within length limits?
- **A second model** that reviews the output.
- **A person**, through human approval.

A guardrail can block the output, send it back for repair, or stop the run.

Guardrails are useful but not perfect. A rule can be too strict and block good work, or too loose and miss a problem. A reviewing model can be fooled in the same way as the first one. So guardrails are layered with other measures, such as limited tools, rather than trusted alone.
