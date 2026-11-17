---
title: The context window
section: memory
order: 10.9
summary: How much text a model can read in one call, and why a long run gets slower and costlier.
related: [what-each-agent-sees, memory-shared-conversation, memory-summaries, tokens-cost-and-time]
---

A model does not remember anything between calls. Every time an agent takes a step, the application sends it everything it should know, as one block of text. The most text a model can take in one call is its **context window**.

**What goes into the window**

- The agent's **instructions**.
- The **task** and the **input** for this step, such as the previous agent's answer.
- Results of **tools**, such as search results.
- Anything from earlier steps that the design chooses to send again.
- Room for the **answer**, which counts against the window as well.

If the text does not fit, it has to be cut, summarised or left out, or the call fails.

**Why it matters**

- **It is re-sent every step.** What fills the window is paid for as input again at each step. In a long run with a growing conversation, cost rises faster than the number of steps.
- **Bigger is not always better.** A model given a lot of text can lose track of a detail in the middle, or follow the wrong part. Sending less, but the right part, often works better.
- **Different models have different sizes of window**, and providers change them often, so this article gives no numbers.

**How designs keep it small**

- Give each agent only what it needs. See [what each agent sees](#/learn/what-each-agent-sees).
- Pass on a short result instead of the whole text.
- Replace old messages with a summary. See [memory: summaries](#/learn/memory-summaries).

**In Agent Atlas**

- The tokens of every step are shown in the replay, so you can see the input grow from one step to the next.
- **Size of a handoff** in Settings, Harness cuts what one agent passes to the next, so a long answer does not fill the next agent's window. The next agent is told that the text was cut, and the replay keeps the whole answer.
- **Maximum tokens per run** and **tokens of one reply** limit the total and the longest single answer.
- Agent Atlas does not summarise old messages. Each agent gets the input its pattern defines, which is why a debate, where everyone reads the whole conversation so far, costs more than a chain.

When a run costs more than you expected, look at the input of the late steps. That is where the window usually filled up.
