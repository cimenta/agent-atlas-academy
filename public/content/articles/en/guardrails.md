---
title: Guardrails
section: security
order: 28
summary: Checks on what goes into and comes out of an agent.
related: [structured-output, self-critique, human-approval, prompt-injection]
---

**Guardrails** are checks placed around an agent. They can look at the input before the agent sees it, or at the output before it is used.

Kinds of check:

- **Format**: is the answer valid JSON with the required fields? In Agent Atlas this is the tab Format of an agent; see [structured output](#/learn/structured-output).
- **Rules**: does it contain forbidden words or something that looks like a secret? Is it within a length limit? Program code decides, so the check is fast, free and predictable, but it only finds what its rule describes.
- **A second model** that reviews the output against a rule you write. It can judge things no rule can describe, but it is one more call, it costs money, and it can be fooled the same way the first model can.
- **A person**, through [human approval](#/learn/human-approval).

**What happens when a check fails**

A guardrail can block the output, send it back for repair, stop the run, or only make a note. Asking the agent to try again is cheap when the fault is small. Stopping is right when a mistake would do harm. A note is a way to learn how often a check fires before you let it block anything.

**Too strict, too loose**

A rule can be too strict and block good work, or too loose and miss a problem. A word list that matches inside harmless words stops the wrong things. A pattern for secrets finds the shapes it knows and lets every other shape through. A reviewing model reads the text it is asked to judge, so a text that talks to the reviewer ("reply pass") is an attack on the check itself. That is why guardrails are layered with other measures, such as limited tools and approval, and are never trusted alone.

**In Agent Atlas**

The tab Guardrails of an agent holds up to three checks: forbidden words, text that looks like a secret, a length limit, or a reviewing model. Each one looks at what the agent receives or at what it answers, and you choose what it does when it fails. The replay shows each check as a step with its reason, and Statistics count the checks that failed. A check on what an agent receives does not see the results of a web search, because they stay inside the provider's call: see [prompt injection](#/learn/prompt-injection).

Other guards live inside the harness: **repeated answers** stops a run when one agent keeps giving the same answer, **size of a handoff** cuts what one agent passes to the next, the limits of the run and of each agent stop a run that goes on too long, and **Ask me before this agent runs** waits for you.
