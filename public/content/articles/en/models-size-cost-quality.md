---
title: Model size, cost and quality
section: control-and-cost
order: 19
summary: Larger models usually do harder work better, but cost more and respond more slowly.
related: [tokens-cost-and-time, single-agent]
---

Providers offer language models in several sizes. As a general pattern:

- **Larger models** handle harder reasoning and long, subtle tasks better. They usually cost more per token and respond more slowly.
- **Smaller models** are faster and cheaper, and are often good enough for simple steps such as formatting, sorting or short summaries.

That makes model choice part of orchestration. A run does not need the same model for every agent. A common design uses a larger model for planning and judging and a smaller one for routine steps.

Prices and models change often, so this article gives no numbers. In Agent Atlas you can set the model per agent and compare runs of the same task: look at the quality of the result, the tokens used and the time taken.
