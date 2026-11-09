---
title: Tokens, cost and time
section: control-and-cost
order: 20
summary: What a run costs and why it takes as long as it does.
related: [models-size-cost-quality, memory-shared-conversation, budgets-and-stop-conditions]
---

Models read and write text in pieces called **tokens**. Providers charge for the tokens you send (**input**) and the tokens the model writes (**output**), usually at different prices.

Two things surprise newcomers:

- **Input grows.** Each call sends the instructions and the context again. In a long conversation every new step re-sends everything before it, so cost rises faster than the number of steps.
- **Time follows output.** The model writes one token after another, so long answers take longer. Tools such as web search add waiting time.

Agent Atlas shows tokens and time for every step, so you can see where a run spent them. With your own API key, the cost is billed by your provider to you, which is why every run has limits.

Parallel agents finish sooner but do not use fewer tokens.
