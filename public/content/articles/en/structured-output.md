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

**Three ways to get a shape, and what each costs**

1. **Ask in the prompt.** You tell the agent the fields. It costs nothing, but a model may still leave a field out or add extra text. In Agent Atlas this is the tab Format of an agent.
2. **Check and repair.** The harness reads the answer, checks every field and its type, and if something is wrong sends one repair message that names the problems. A second failure ends the agent with an error. This costs one more model call when a repair is needed. The replay shows each check as a tick or a cross.
3. **Force it with the provider.** Some providers can be told the schema of the reply and then keep to it. This makes a repair rare, but not every model combines it with every tool (a web search, for example), so it is not used for an agent that searches. In Agent Atlas this is the setting Format enforcement in the harness.

**Watch out for**

- A valid format does not mean the content is true. Check facts separately.
- Every check and repair is a model call, so it shows in the cost. See [retries and errors](#/learn/retries-and-errors) for what happens when calls fail, and [guardrails](#/learn/guardrails) for checks on the content itself.
